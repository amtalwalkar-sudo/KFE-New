import { ShiftTripRepository, configureCanonicalReadBoundary } from '../../repositories/shiftTripRepository.js'
import { FuelRepository } from '../../repositories/fuelRepository.js'
import { completeEndShift } from './endShift.js'
import { recordFuelEntry } from './fuel.js'
import { validateShiftStartOdometer, validateFirstDayShiftStartOdometer, validateGapAllocation } from '../../domain/work/shift.js'
import { calculateFuelQuantity, validateFuelEntry } from '../../domain/work/fuel.js'
import { calculateRollingFuelCostPerKm } from '../../domain/math/fuel.js'
import { WORK_TRIP_OPERATORS, validateTripOperator, validateTripCorrection } from '../../domain/work/trip.js'
import { BackupService } from '../backup/backupService.js'
import { WorkRuntimePorts } from './workRuntimePorts.js'
import { captureTripBoundaryLocation } from './tripBoundaryLocation.js'
import { EventLocationService } from '../location/eventLocationService.js'
import { CanonicalWorkBoundary } from './canonicalWorkBoundary.js'
import { recoverCanonicalWorkSnapshot } from './canonicalWorkRecovery.js'
import { reconcileShiftRevenue } from '../../domain/work/revenueReconciliation.js'

const checkpoint = () => BackupService.requestLocalBackupCheckpoint()
const nativeCanonicalAvailable = () => { try { return WorkRuntimePorts.canonicalWork.isAvailable() === true } catch (_) { return false } }
const isAndroidRuntime = () => { try { return WorkRuntimePorts.platform.getPlatform() === 'android' } catch (_) { return nativeCanonicalAvailable() } }
const stableCanonicalValue = value => {
  if (Array.isArray(value)) return value.map(stableCanonicalValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableCanonicalValue(value[key])]))
  return value
}
const withoutCanonicalSyncMetadata = record => {
  const { _nativeCanonicalSync, ...canonicalRecord } = record || {}
  return canonicalRecord
}
const mirrorCanonicalRecord = async (entityType, record) => {
  if (!record?.id || !nativeCanonicalAvailable()) return record
  let candidate = record
  for (let attempt = 0; attempt < 3; attempt++) {
    const canonicalRecord = withoutCanonicalSyncMetadata(candidate)
    const fingerprint = JSON.stringify(stableCanonicalValue(canonicalRecord))
    const existingPending = candidate?._nativeCanonicalSync
    const operationId = existingPending?.operationId && existingPending?.fingerprint === fingerprint
      ? existingPending.operationId
      : CanonicalWorkBoundary.createOperationId()
    // Persist the exact operation identity before crossing the native bridge. If the
    // process dies or the acknowledgement is lost, recovery retries the same id;
    // SQLite's operation ledger makes that retry idempotent.
    try {
      const journaled = await ShiftTripRepository.markCanonicalSyncPending({
        entityType,
        entityId: candidate.id,
        operationId,
        fingerprint,
        record: canonicalRecord,
      })
      if (!journaled) throw new Error(`Could not durably journal native canonical ${entityType} write.`)
    } catch (error) {
      // A local mutation may race this mirror between its read and journal step.
      // Re-read the actual IndexedDB payload and journal that snapshot instead of
      // failing after the business mutation has already been saved locally.
      if (!String(error?.message || '').includes('Local canonical record changed before native mirror') || attempt === 2) throw error
      const latest = entityType === 'SHIFT'
        ? await ShiftTripRepository.getAllShifts({ skipCanonicalReadBoundary: true })
        : await ShiftTripRepository.getAllTrips({ skipCanonicalReadBoundary: true })
      candidate = latest.find(item => item?.id === record.id)
      if (!candidate) throw new Error(`Local canonical ${entityType} record disappeared before native mirror.`)
      continue
    }
    const outcome = await CanonicalWorkBoundary.putRecord({ operationId, entityType, record: canonicalRecord })
    if (outcome?.accepted !== true) throw new Error(`Native canonical ${entityType} commit was not acknowledged.`)
    await ShiftTripRepository.clearCanonicalSyncPending({ entityType, entityId: candidate.id, operationId, fingerprint })
    return candidate
  }
  throw new Error(`Native canonical ${entityType} mirror could not stabilize its local snapshot.`)
}
const mirrorCanonicalTripById = async id => {
  if (!id || !nativeCanonicalAvailable()) return null
  const trips = await ShiftTripRepository.getAllTrips({ skipCanonicalReadBoundary: true })
  const record = trips.find(item => item.id === id)
  if (record) await mirrorCanonicalRecord('TRIP', record)
  return record || null
}
// Native putRecord now updates the shift's derived revenue projection atomically
// with each canonical trip mirror. Do not send a second full SHIFT snapshot here:
// it can race that projection and collide on updatedAt.

let canonicalReadAttempt = null
const reconcileCanonicalReads = () => {
  if (!nativeCanonicalAvailable()) return Promise.resolve()
  if (canonicalReadAttempt) return canonicalReadAttempt
  canonicalReadAttempt = recoverCanonicalWorkSnapshot({
    readCanonical: async () => {
      const [shifts, trips] = await Promise.all([
        WorkRuntimePorts.canonicalWork.listRecords({ entityType: 'SHIFT', limit: 1000 }),
        WorkRuntimePorts.canonicalWork.listRecords({ entityType: 'TRIP', limit: 1000 }),
      ])
      return { shifts, trips }
    },
    readLocal: async () => {
      const [shifts, trips] = await Promise.all([
        ShiftTripRepository.getAllShifts({ skipCanonicalReadBoundary: true }),
        ShiftTripRepository.getAllTrips({ skipCanonicalReadBoundary: true }),
      ])
      return { shifts, trips }
    },
    mirrorRecord: mirrorCanonicalRecord,
    syncCanonicalRecords: records => ShiftTripRepository.syncCanonicalRecords(records),
  }).finally(() => { canonicalReadAttempt = null })
  return canonicalReadAttempt
}
configureCanonicalReadBoundary(reconcileCanonicalReads)

const captureAndPersistEventLocation = (entityType, entityId, eventType, eventAt) => EventLocationService.captureForEvent(entityType, entityId, eventType, eventAt)

const captureAndPersistTripBoundary = (tripId, field) => {
  if (!tripId || !['tripStartLocation', 'tripEndLocation'].includes(field)) return
  void (async () => {
    const existing = (await ShiftTripRepository.getAllTrips()).find(item => item.id === tripId)
    if (!existing || existing[field]) return
    const location = await captureTripBoundaryLocation()
    if (!location) return
    if (nativeCanonicalAvailable()) {
      try {
        const outcome = await CanonicalWorkBoundary.persistTripBoundarySnapshot({
          operationId: `native-trip-boundary-v2-${tripId}-${field}`,
          tripId,
          field,
          snapshot: location,
        })
        if (outcome?.accepted !== true || !outcome?.outcome?.record?.[field]) {
          throw new Error('Native canonical boundary snapshot was not durably acknowledged.')
        }
      } catch (error) {
        // SQLite is authoritative on Android. If a native overlay captured the
        // same boundary concurrently, converge the PWA cache to that durable
        // snapshot instead of trying to mirror a full, version-bumped trip.
        await ShiftTripRepository.getAllTrips()
        throw error
      }
      await ShiftTripRepository.getAllTrips()
      checkpoint()
      return
    }
    const saved = field === 'tripStartLocation'
      ? await ShiftTripRepository.setTripStartLocation(tripId, location)
      : await ShiftTripRepository.setTripEndLocation(tripId, location)
    if (saved) checkpoint()
  })().catch(error => console.warn('Trip boundary GPS snapshot could not be saved:', tripId, field, error))
}

export const WorkService = Object.freeze({
  getTripOperators() { return WORK_TRIP_OPERATORS },
  validateTripOperator(operator) { return validateTripOperator(operator) },
  validateTripCorrection(data) { return validateTripCorrection(data) },
  validateFuelEntry(data) { return validateFuelEntry(data) },
  async getActiveState() {
    // The repository owns the single-flight canonical read boundary so startup,
    // resume, history and calculation consumers cannot race independent recoveries.
    return ShiftTripRepository.getActive()
  },
  async getTripsForShift(shiftId) { return ShiftTripRepository.getTripsForShift(shiftId) },
  async getAllTrips() { return ShiftTripRepository.getAllTrips() },
  async getLastCompletedShift() { return ShiftTripRepository.getLastCompletedShift() },
  async getBusinessStartBaseline() { return ShiftTripRepository.getBusinessStartBaseline() },
  async getLastCompletedTrip() { return ShiftTripRepository.getLastCompletedTrip() },
  async getFuelLogs() {
    // Ensure the single current vehicle master exists and legacy fuel entries
    // are linked before returning records to the PWA/read models.
    await ShiftTripRepository.getPrimaryVehicleId()
    return FuelRepository.getAll()
  },
  calculateFuelMetrics(logs = []) { return calculateRollingFuelCostPerKm(logs) },
  async getFuelMetrics() {
    await ShiftTripRepository.getPrimaryVehicleId()
    return calculateRollingFuelCostPerKm(await FuelRepository.getAll())
  },
  validateShiftStartOdometer(currentOdometer, previousOdometer) { return validateShiftStartOdometer(currentOdometer, previousOdometer) },
  validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer) { return validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer) },
  validateGapAllocation(gapKm, category) { return validateGapAllocation(gapKm, category) },
  calculateFuelQuantity(pricePerKg, amount) { return calculateFuelQuantity({ pricePerKg, amount }) },
  reconcileShiftRevenue(data) { return reconcileShiftRevenue(data) },
  async startShift(data) { const result = await ShiftTripRepository.createShift(data); await mirrorCanonicalRecord('SHIFT', result); checkpoint(); captureAndPersistEventLocation('SHIFT', result.id, 'SHIFT_START', result.shiftStartAt || result.createdAt); return result },
  async startTrip(data) {
    const validation = validateTripOperator(data?.operator)
    if (!validation.valid) return { ok: false, reason: validation.reason }
    const result = await ShiftTripRepository.createTrip({ ...data, operator: validation.operator, tripStage: data?.tripStage || 'GOING_TO_PICKUP' }); await mirrorCanonicalRecord('TRIP', result); checkpoint()
    // Pickup journey origin is optional metadata captured after the canonical trip record commits.
    // It never delays the user's pickup workflow and uses the same offline-capable one-shot GPS path.
    if (result?.id) captureAndPersistEventLocation('TRIP', result.id, 'PICKUP_START', result.createdAt || result.tripStartAt)
    return result
  },
  async startRide(data) {
    const result = await ShiftTripRepository.setTripStage(data?.id, 'RIDE_STARTED')
    if (result && typeof result === 'object') await mirrorCanonicalRecord('TRIP', result)
    checkpoint()
    if (result && typeof result === 'object' && result.tripStage === 'RIDE_STARTED') {
      captureAndPersistTripBoundary(result.id, 'tripStartLocation')
    }
    return result
  },
  async completeTrip(data) {
    const result = await ShiftTripRepository.completeTrip({ ...data }); await mirrorCanonicalTripById(data?.id); checkpoint()
    captureAndPersistTripBoundary(data?.id, 'tripEndLocation')
    return result
  },
  async cancelTrip(data) {
    const result = await ShiftTripRepository.cancelTrip(data)
    await mirrorCanonicalTripById(data?.id)
    checkpoint()
    captureAndPersistTripBoundary(data?.id, 'tripEndLocation')
    return result
  },
  async updateTrip(data) {
    const validation = validateTripCorrection(data)
    if (!validation.valid) return { ok: false, reason: validation.reason }
    const result = await ShiftTripRepository.updateTrip({ ...data, ...validation }); await mirrorCanonicalTripById(data?.id); checkpoint(); return result
  },
  async updateFuel(data) { const result = await FuelRepository.update(data.id, data); checkpoint(); return { ok: true, record: result } },
  async deleteFuel(id) { const result = await FuelRepository.remove(id); checkpoint(); return { ok: result } },
  async endShift(data) {
    const active = await ShiftTripRepository.getActive()
    // Create the native mirror identity before the local completion transaction.
    // The repository stores this identity with the COMPLETED shift atomically,
    // so a process death immediately after the IndexedDB commit remains recoverable.
    const canonicalSyncOperationId = nativeCanonicalAvailable()
      ? CanonicalWorkBoundary.createOperationId()
      : null
    const completionData = {
      ...data,
      ...(canonicalSyncOperationId ? { canonicalSyncOperationId } : {})
    }
    const result = await completeEndShift(completionData)
    let completedShift = null
    if (result?.ok && active.shift?.id && nativeCanonicalAvailable()) {
      // Do not cross the canonical read/recovery boundary between the local
      // completion commit and its native mirror. Native SQLite still contains
      // ACTIVE at this point; a completed-shift lookup would reconcile that
      // stale native snapshot back into IndexedDB before we can mirror COMPLETED.
      const localShifts = await ShiftTripRepository.getAllShifts({ skipCanonicalReadBoundary: true })
      const closedShift = localShifts.find(shift => shift.id === active.shift.id && shift.status === 'COMPLETED')
      if (!closedShift) throw new Error('Completed shift was not found after the end-shift commit.')
      completedShift = closedShift
      await mirrorCanonicalRecord('SHIFT', closedShift)
      // The shift is now authoritative in native storage. Mirror trip records
      // from the same local snapshot without an intervening recovery read.
      const localTrips = await ShiftTripRepository.getTripsForShift(active.shift.id, { skipCanonicalReadBoundary: true })
      for (const trip of localTrips) await mirrorCanonicalRecord('TRIP', trip)
    }
    checkpoint()
    if (result?.ok && active.shift?.id) {
      if (!completedShift) completedShift = (await ShiftTripRepository.getAllShifts({ skipCanonicalReadBoundary: true })).find(shift => shift.id === active.shift.id && shift.status === 'COMPLETED') || null
      captureAndPersistEventLocation('SHIFT', active.shift.id, 'SHIFT_END', completedShift?.shiftEndAt || null)
    }
    return result
  },
  async recordFuel(data) {
    const result = await recordFuelEntry(data)
    // Fuel persistence is the user-visible commit. Local backup is best-effort
    // follow-up work and must not hold the form open after the record is saved.
    void Promise.resolve().then(() => checkpoint()).catch(() => {})
    if (result?.ok && result.record?.id) captureAndPersistEventLocation('FUEL', result.record.id, 'FUEL_ENTRY', result.record.createdAt || result.record.capturedAt)
    return result
  },
})
