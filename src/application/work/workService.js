import { ShiftTripRepository, configureCanonicalReadBoundary } from '../../repositories/shiftTripRepository.js'
import { FuelRepository } from '../../repositories/fuelRepository.js'
import { LocationRepository } from '../../repositories/locationRepository.js'
import { captureLifecycleLocation } from './location.js'
import { completeEndShift } from './endShift.js'
import { recordFuelEntry } from './fuel.js'
import { validateShiftStartOdometer, validateFirstDayShiftStartOdometer, validateGapAllocation } from '../../domain/work/shift.js'
import { calculateFuelQuantity, validateFuelEntry } from '../../domain/work/fuel.js'
import { calculateRollingFuelCostPerKm } from '../../domain/math/fuel.js'
import { WORK_TRIP_OPERATORS, validateTripOperator, validateTripCorrection } from '../../domain/work/trip.js'
import { BackupService } from '../backup/backupService.js'
import { MovementAccountingService, routeTrace, assessGpsTraceCompleteness, isUsableDistanceKm } from '../../domain/movement/movementAccounting.js'
import { WorkRuntimePorts } from './workRuntimePorts.js'
import { CanonicalWorkBoundary } from './canonicalWorkBoundary.js'
import { recoverCanonicalWorkSnapshot } from './canonicalWorkRecovery.js'
import { calculateTraceDistanceKm } from '../../domain/movement/traceDistance.js'
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

let nativeGpsRecoveryAttempt = null

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
  async getLocations(entityType, entityId) { return LocationRepository.forEntity(entityType, entityId) },
  async recoverNativeGpsTraces() {
    // Startup, Work resume and cloud backup can request recovery at the same time.
    // Share one import transaction to avoid duplicate GPS evidence being inserted.
    if (nativeGpsRecoveryAttempt) return nativeGpsRecoveryAttempt
    nativeGpsRecoveryAttempt = this._recoverNativeGpsTraces().finally(() => { nativeGpsRecoveryAttempt = null })
    return nativeGpsRecoveryAttempt
  },
  async _recoverNativeGpsTraces() {
    const [shifts, trips, owners] = await Promise.all([
      ShiftTripRepository.getAllShifts(),
      ShiftTripRepository.getAllTrips(),
      WorkRuntimePorts.nativeGps.listTraceOwners(),
    ])
    const activeShift = shifts.find(shift => shift.status === 'ACTIVE')
    const activeTrip = trips.find(trip => trip.status === 'ACTIVE')
    const shiftById = new Map(shifts.map(shift => [shift.id, shift]))
    const tripById = new Map(trips.map(trip => [trip.id, trip]))
    const recovered = []
    const unresolvedOwners = []
    for (const ownerId of owners) {
      const trip = tripById.get(ownerId)
      const shift = shiftById.get(ownerId)
      // Snapshot even the currently active trace into canonical IndexedDB so
      // backups include it. Keep the live JSONL file only for the active owner;
      // completed/orphaned files can be cleared after a successful import.
      const entityType = trip ? 'TRIP' : shift ? 'SHIFT' : null
      if (!entityType) { unresolvedOwners.push(ownerId); continue }
      const activeOwner = trip?.status === 'ACTIVE' || (shift?.status === 'ACTIVE' && !activeTrip)
      try {
        const result = await WorkRuntimePorts.nativeGps.syncTrace(ownerId, { entityType, clearAfterImport: !activeOwner })
        const imported = Number(result?.imported) || 0
        if (imported > 0) checkpoint()
        recovered.push({ ownerId, entityType, imported })
      } catch (error) {
        unresolvedOwners.push(ownerId)
        console.warn('KFE native GPS trace recovery deferred; source file retained:', ownerId, error)
      }
    }
    // Revalidate previously stored GPS-derived trip distances after trace recovery.
    // Old builds could store a tiny estimate from a short/stale trace as if it were
    // complete. Never erase a manually entered authoritative distance.
    for (const trip of trips.filter(item => item.status === 'COMPLETED' && ['GPS_LINE_TRACE', 'VALHALLA_ROAD_TRACE'].includes(item.tripKmAuthority))) {
      try {
        const snapshots = (await LocationRepository.forEntity('TRIP', trip.id)).filter(point => point?.eventType === 'PASSENGER_RIDE_TRACE')
        const quality = assessGpsTraceCompleteness(snapshots, { startAt: trip.tripStartAt, endAt: trip.tripEndAt })
        if (!quality.complete) {
          const invalidated = await ShiftTripRepository.invalidateGpsTripMovement({ id: trip.id, reason: quality.reason, traceQuality: quality })
          if (invalidated) recovered.push({ ownerId: trip.id, entityType: 'TRIP', imported: 0, qualityStatus: 'INCOMPLETE', reason: quality.reason })
        }
      } catch (error) {
        console.warn('Unable to verify historical GPS-derived trip distance; preserving raw trace evidence:', trip.id, error)
      }
    }
    if (unresolvedOwners.length) throw new Error('Native GPS trace recovery incomplete; cloud backup is blocked to avoid omitting movement evidence. Unresolved owners: ' + unresolvedOwners.join(', '))
    return { ownersChecked: owners.length, recovered, unresolvedOwners: [] }
  },
  async previewMovementReconciliation({ shiftId, closingOdometer, trips = [] }) {
    const shift = await ShiftTripRepository.getActive()
    if (!shift?.shift?.id || shift.shift.id !== shiftId) return { reconciliationStatus: 'UNAVAILABLE', reason: 'ACTIVE_SHIFT_NOT_FOUND' }
    const shiftGpsSnapshots = await LocationRepository.forEntity('SHIFT', shiftId)
    const tripGpsSnapshots = (await Promise.all(trips.map(trip => LocationRepository.forEntity('TRIP', trip.id)))).flat()
    const gpsSnapshots = [...shiftGpsSnapshots, ...tripGpsSnapshots]
    try {
      return await MovementAccountingService.reconcileShiftMovement({
        trips,
        startOdometer: shift.shift.startOdometer,
        endOdometer: closingOdometer,
        router: WorkRuntimePorts.routing.createRouter(),
        businessKmByTripId: Object.fromEntries(trips.filter(item => item.tripKm != null && item.tripKm !== '' && Number.isFinite(Number(item.tripKm)) && Number(item.tripKm) >= 0).map(item => [item.id, Number(item.tripKm)])),
        gpsSnapshots
      })
    } catch (error) {
      return { reconciliationStatus: 'UNAVAILABLE', reason: error?.message || 'MOVEMENT_RECONCILIATION_FAILED', gpsTracePoints: gpsSnapshots.length }
    }
  },
  async getTripGpsDistanceKm(tripId) {
    try { await WorkRuntimePorts.nativeGps.syncTrace(tripId) } catch (_) {}
    const snapshots = (await LocationRepository.forEntity('TRIP', tripId)).filter(point => point?.eventType === 'PASSENGER_RIDE_TRACE')
    const filtered = MovementAccountingService.filterGpsTrace(snapshots)
    return filtered.length >= 2 ? calculateTraceDistanceKm(filtered) : null
  },
  async getTripDeadMovementDistanceKm(tripId) {
    try { await WorkRuntimePorts.nativeGps.syncTrace(tripId) } catch (_) {}
    const snapshots = (await LocationRepository.forEntity('TRIP', tripId)).filter(point => point?.eventType === 'DEAD_MOVEMENT_TRACE')
    const filtered = MovementAccountingService.filterGpsTrace(snapshots)
    if (filtered.length < 2) return null
    const distanceKm = calculateTraceDistanceKm(filtered)
    return Number.isFinite(Number(distanceKm)) ? Number(distanceKm) : null
  },
  calculateLiveMovement(points = []) { const filteredPoints = MovementAccountingService.filterGpsTrace(points); return { points: filteredPoints, distanceKm: calculateTraceDistanceKm(filteredPoints) } },
  async captureLocation(data) { const result = await captureLifecycleLocation(data); checkpoint(); return result },
  validateShiftStartOdometer(currentOdometer, previousOdometer) { return validateShiftStartOdometer(currentOdometer, previousOdometer) },
  validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer) { return validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer) },
  validateGapAllocation(gapKm, category) { return validateGapAllocation(gapKm, category) },
  calculateFuelQuantity(pricePerKg, amount) { return calculateFuelQuantity({ pricePerKg, amount }) },
  calculateTraceDistanceKm(points = []) { return calculateTraceDistanceKm(points) },
  reconcileShiftRevenue(data) { return reconcileShiftRevenue(data) },
  async startShift(data) { const result = await ShiftTripRepository.createShift(data); await mirrorCanonicalRecord('SHIFT', result); checkpoint(); return result },
  async startTrip(data) {
    const validation = validateTripOperator(data?.operator)
    if (!validation.valid) return { ok: false, reason: validation.reason }
    const result = await ShiftTripRepository.createTrip({ ...data, operator: validation.operator, tripStage: data?.tripStage || 'GOING_TO_PICKUP' }); await mirrorCanonicalRecord('TRIP', result); checkpoint()
    void captureLifecycleLocation({ entityType: 'TRIP', entityId: result.id, eventType: 'START' }).then(location => {
      if (location) return ShiftTripRepository.setTripStartLocation(result.id, location)
      return null
    }).catch(() => {})
    return result
  },
  async startRide(data) {
    const result = await ShiftTripRepository.setTripStage(data?.id, 'RIDE_STARTED')
    if (result && typeof result === 'object') await mirrorCanonicalRecord('TRIP', result)
    checkpoint()
    if (!result || !data?.id) return result
    // Record a fresh passenger-ride boundary separately from the pickup/dead-leg start.
    // tripStartAt is the authoritative lifecycle transition time; capturedAt remains
    // the actual GPS fix time, and rideStartLocationEventAt links the two explicitly.
    void captureLifecycleLocation({ entityType: 'TRIP', entityId: data.id, eventType: 'RIDE_START' }).then(async location => {
      if (!location) return
      await ShiftTripRepository.setTripRideStartLocation(data.id, location, result.tripStartAt || null)
      await mirrorCanonicalTripById(data.id)
      checkpoint()
    }).catch(error => console.warn('Passenger-ride start GPS fix unavailable; lifecycle timestamp retained:', error))
    return result
  },
  async completeTrip(data) {
    // Commit the terminal state first. The endpoint GPS snapshot is best-effort
    // enrichment and never delays the swipe transition or pending-fare form.
    const result = await ShiftTripRepository.completeTrip({ ...data }); await mirrorCanonicalShiftByTripId(data?.id); checkpoint()
    const tripId = data?.id
    // Capture the trip endpoint as a one-shot local GPS snapshot with its fix timestamp.
    if (tripId) {
      void captureLifecycleLocation({ entityType: 'TRIP', entityId: tripId, eventType: 'END' })
        .then(async location => {
          if (!location) {
            console.warn('Trip completed without a fresh endpoint GPS fix:', tripId)
            return
          }
          await ShiftTripRepository.setTripEndLocation(tripId, location)
          await mirrorCanonicalTripById(tripId)
          checkpoint()
        })
        .catch(error => console.warn('Trip endpoint GPS snapshot could not be saved:', tripId, error))
    }
    return result
  },
  async cancelTrip(data) {
    const result = await ShiftTripRepository.cancelTrip(data)
    await mirrorCanonicalShiftByTripId(data?.id)
    checkpoint()
    const tripId = data?.id
    if (tripId) {
      void captureLifecycleLocation({ entityType: 'TRIP', entityId: tripId, eventType: 'CANCELLED' })
        .then(async location => {
          if (!location) return
          await ShiftTripRepository.setTripEndLocation(tripId, location)
          await mirrorCanonicalTripById(tripId)
          checkpoint()
        })
        .catch(error => console.warn('Cancelled trip endpoint GPS snapshot could not be saved:', tripId, error))
    }
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
