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
  const trips = await ShiftTripRepository.getAllTrips()
  const record = trips.find(item => item.id === id)
  if (record) await mirrorCanonicalRecord('TRIP', record)
  return record || null
}
const mirrorCanonicalShiftByTripId = async id => {
  const trip = await mirrorCanonicalTripById(id)
  if (trip?.shiftId && nativeCanonicalAvailable()) {
    const shift = (await ShiftTripRepository.getAllShifts()).find(item => item.id === trip.shiftId)
    if (shift) await mirrorCanonicalRecord('SHIFT', shift)
  }
  return trip
}

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
  async startShift(data) { const result = await ShiftTripRepository.createShift(data); await mirrorCanonicalRecord('SHIFT', result); checkpoint(); return result },
  async startTrip(data) {
    const validation = validateTripOperator(data?.operator)
    if (!validation.valid) return { ok: false, reason: validation.reason }
    const result = await ShiftTripRepository.createTrip({ ...data, operator: validation.operator, tripStage: data?.tripStage || 'GOING_TO_PICKUP' }); await mirrorCanonicalRecord('TRIP', result); checkpoint()
    return result
  },
  async startRide(data) {
    const result = await ShiftTripRepository.setTripStage(data?.id, 'RIDE_STARTED')
    if (result && typeof result === 'object') await mirrorCanonicalRecord('TRIP', result)
    checkpoint()
    return result
  },
  async completeTrip(data) {
    const result = await ShiftTripRepository.completeTrip({ ...data }); await mirrorCanonicalShiftByTripId(data?.id); checkpoint()
    return result
  },
  async cancelTrip(data) {
    const result = await ShiftTripRepository.cancelTrip(data)
    await mirrorCanonicalShiftByTripId(data?.id)
    checkpoint()
    return result
  },
  async updateTrip(data) {
    const validation = validateTripCorrection(data)
    if (!validation.valid) return { ok: false, reason: validation.reason }
    const result = await ShiftTripRepository.updateTrip({ ...data, ...validation }); await mirrorCanonicalShiftByTripId(data?.id); checkpoint(); return result
  },
  async updateFuel(data) { const result = await FuelRepository.update(data.id, data); checkpoint(); return { ok: true, record: result } },
  async deleteFuel(id) { const result = await FuelRepository.remove(id); checkpoint(); return { ok: result } },
  async endShift(data) {
    const active = await ShiftTripRepository.getActive()
    const completionData = { ...data }
    const result = await completeEndShift(completionData)
    if (nativeCanonicalAvailable()) {
      const closedShift = await ShiftTripRepository.getLastCompletedShift()
      if (closedShift?.id === active.shift?.id) await mirrorCanonicalRecord('SHIFT', closedShift)
      if (active.shift?.id) for (const trip of await ShiftTripRepository.getTripsForShift(active.shift.id)) await mirrorCanonicalRecord('TRIP', trip)
    }
    checkpoint()
    return result
  },
  async recordFuel(data) {
    const result = await recordFuelEntry(data)
    // Fuel persistence is the user-visible commit. Local backup is best-effort
    // follow-up work and must not hold the form open after the record is saved.
    void Promise.resolve().then(() => checkpoint()).catch(() => {})
    return result
  },
})
