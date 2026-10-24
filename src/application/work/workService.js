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
import { normalizeShiftInput, normalizeTripInput } from '../../domain/canonicalNormalization.js'
import { transitionTrip, transitionTripStage } from '../../domain/work/tripLifecycle.js'
import { deriveLiveRevenue } from '../../domain/work/liveRevenue.js'
import { validateEndShiftEntry } from '../../domain/work/endShift.js'

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

// Android lifecycle writes commit to SQLite before touching the IndexedDB read model.
// The entity/version operation key makes a retry of the same payload idempotent.
const readNativeWorkSnapshot = async () => {
  const [shiftResult, tripResult] = await Promise.all([
    WorkRuntimePorts.canonicalWork.listRecords({ entityType: 'SHIFT', limit: 1000 }),
    WorkRuntimePorts.canonicalWork.listRecords({ entityType: 'TRIP', limit: 1000 }),
  ])
  return { shifts: shiftResult.records || [], trips: tripResult.records || [] }
}
const stableIntentValue = value => {
  if (Array.isArray(value)) return value.map(stableIntentValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().filter(key => !['id', 'createdAt', 'updatedAt', 'shiftStartAt', 'tripStartAt'].includes(key)).map(key => [key, stableIntentValue(value[key])]))
}
const stableCreateIntentKey = (entityType, data) => JSON.stringify({ entityType, input: stableIntentValue(data || {}) })
const commitPreparedCreateIntent = async (entityType, proposedRecord, data) => {
  const intent = await CanonicalWorkBoundary.prepareCreateIntent({
    entityType, intentKey: stableCreateIntentKey(entityType, data), record: proposedRecord,
  })
  const result = await CanonicalWorkBoundary.putRecord({
    operationId: intent.operationId, entityType, record: intent.record, expectAbsent: true,
  })
  if (result?.accepted !== true || !result?.outcome?.record) throw new Error(`Native canonical ${entityType} create was not acknowledged.`)
  // A process death before this point leaves a PENDING SQLite intent; retry reuses its id and operation.
  await CanonicalWorkBoundary.completeCreateIntent(intent.intentId)
  const snapshot = await readNativeWorkSnapshot()
  await ShiftTripRepository.syncCanonicalRecords(snapshot)
  return intent.record
}
const commitNativeFirst = async (entityType, record, { expectedUpdatedAt = null, expectAbsent = false } = {}) => {
  if (!nativeCanonicalAvailable()) throw new Error('Native-first lifecycle writes require Android canonical storage.')
  const operationId = `pwa-${entityType.toLowerCase()}-${record.id}-${record.updatedAt}`
  const result = await CanonicalWorkBoundary.putRecord({ operationId, entityType, record, expectedUpdatedAt, expectAbsent })
  if (result?.accepted !== true || !result?.outcome?.record) {
    throw new Error(`Native canonical ${entityType} commit was not acknowledged.`)
  }
  // This refresh is deliberately after the durable native acknowledgement.
  const snapshot = await readNativeWorkSnapshot()
  await ShiftTripRepository.syncCanonicalRecords(snapshot)
  return snapshot
}
const nextCanonicalTimestamp = previous => {
  const now = Date.now()
  const prior = Date.parse(previous || '')
  return new Date(Number.isFinite(prior) && now <= prior ? prior + 1 : now).toISOString()
}
const findNativeRecord = async (entityType, id) => {
  const snapshot = await readNativeWorkSnapshot()
  return (entityType === 'SHIFT' ? snapshot.shifts : snapshot.trips).find(record => record.id === id) || null
}
const createNativeShiftRecord = data => {
  const normalized = normalizeShiftInput(data)
  const now = new Date().toISOString()
  const startOdometer = Number(normalized.startOdometer)
  if (!Number.isFinite(startOdometer)) throw new Error('startOdometer must be a finite number.')
  return {
    id: normalized.id || CanonicalWorkBoundary.createOperationId(), startOdometer,
    openingPersonalKm: Number(normalized.openingPersonalKm || 0),
    openingDeadKm: Number(normalized.openingDeadKm || 0),
    openingPersonalToll: Number(normalized.openingPersonalToll || 0),
    openingPersonalParking: Number(normalized.openingPersonalParking || 0),
    openingBaselineType: normalized.openingBaselineType || 'POST_KFE_GAP',
    historicalOdometerGapKm: Number(normalized.historicalOdometerGapKm || 0),
    businessStartDate: normalized.businessStartDate || null,
    businessStartOdometer: Number.isFinite(Number(normalized.businessStartOdometer)) ? Number(normalized.businessStartOdometer) : null,
    endOdometer: null, totalDistance: 0, revenue: 0, toll: 0, parking: 0,
    tollParkingRevenueTreatment: 'INCLUDED', tollParkingCaptureMode: 'ADDITIONAL_ONLY',
    tollTreatment: normalized.tollTreatment || normalized.tollParkingRevenueTreatment || 'INCLUDED',
    parkingTreatment: normalized.parkingTreatment || normalized.tollParkingRevenueTreatment || 'INCLUDED',
    shiftStartAt: normalized.shiftStartAt || now, shiftEndAt: null, status: 'ACTIVE',
    createdAt: now, updatedAt: now,
  }
}
const createNativeTripRecord = data => {
  const normalized = normalizeTripInput(data)
  if (!normalized.shiftId) throw new Error('shiftId is required for a Trip.')
  const now = new Date().toISOString()
  return {
    id: normalized.id || CanonicalWorkBoundary.createOperationId(), shiftId: normalized.shiftId,
    operator: normalized.operator, tripStartAt: normalized.tripStartAt || null, tripEndAt: null,
    status: 'ACTIVE', tripKm: normalized.tripKm ?? null,
    tripKmAuthority: normalized.tripKm !== undefined ? 'MANUAL' : 'ESTIMATE',
    tripKmProvenance: normalized.tripKmProvenance ?? null,
    tripStartLocation: null, tripEndLocation: null,
    tripStartLocationStatus: 'MISSING', tripEndLocationStatus: 'MISSING',
    tripStage: normalized.tripStage || 'GOING_TO_PICKUP',
    toll: normalized.toll ?? 0, parking: normalized.parking ?? 0,
    tollTreatment: normalized.tollTreatment || normalized.tollParkingRevenueTreatment || 'INCLUDED',
    parkingTreatment: normalized.parkingTreatment || normalized.tollParkingRevenueTreatment || 'INCLUDED',
    revenue: normalized.revenue ?? null, revenueAuthority: 'SUPPORTING_ONLY',
    revenueProvenance: normalized.revenueProvenance ?? null, fareDetailsSkipped: false,
    cancelledRevenue: null, cancelReason: null, createdAt: now, updatedAt: now,
  }
}
const correctNativeTrip = (trip, data, now) => {
  const normalized = normalizeTripInput(data)
  const next = { ...trip }
  if (normalized.operator !== undefined) next.operator = normalized.operator
  if (normalized.tripKm !== undefined) { next.tripKm = normalized.tripKm; next.tripKmAuthority = 'MANUAL'; if (normalized.tripKmProvenance !== undefined) next.tripKmProvenance = normalized.tripKmProvenance }
  if (normalized.revenue !== undefined) { next.revenue = normalized.revenue; if (next.status === 'CANCELLED') next.cancelledRevenue = normalized.revenue; next.revenueAuthority = 'SUPPORTING_ONLY'; if (normalized.revenueProvenance !== undefined) next.revenueProvenance = normalized.revenueProvenance }
  for (const field of ['toll', 'parking', 'tollTreatment', 'parkingTreatment', 'cancelReason', 'fareDetailsSkipped']) if (normalized[field] !== undefined) next[field] = normalized[field]
  next.updatedAt = now
  return next
}

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
  async startShift(data) { const result = nativeCanonicalAvailable() ? await (async () => { const record = createNativeShiftRecord(data); return await commitPreparedCreateIntent('SHIFT', record, data) })() : await ShiftTripRepository.createShift(data); if (!nativeCanonicalAvailable()) await mirrorCanonicalRecord('SHIFT', result); checkpoint(); captureAndPersistEventLocation('SHIFT', result.id, 'SHIFT_START', result.shiftStartAt || result.createdAt); return result },
  async startTrip(data) {
    const validation = validateTripOperator(data?.operator)
    if (!validation.valid) return { ok: false, reason: validation.reason }
    const tripData = { ...data, operator: validation.operator, tripStage: data?.tripStage || 'GOING_TO_PICKUP' }; const result = nativeCanonicalAvailable() ? await (async () => { const record = createNativeTripRecord(tripData); return await commitPreparedCreateIntent('TRIP', record, tripData) })() : await ShiftTripRepository.createTrip(tripData); if (!nativeCanonicalAvailable()) await mirrorCanonicalRecord('TRIP', result); checkpoint()
    // Pickup journey origin is optional metadata captured after the canonical trip record commits.
    // It never delays the user's pickup workflow and uses the same offline-capable one-shot GPS path.
    if (result?.id) captureAndPersistEventLocation('TRIP', result.id, 'PICKUP_START', result.createdAt || result.tripStartAt)
    return result
  },
  async startRide(data) {
    const result = nativeCanonicalAvailable() ? await (async () => { const trip = await findNativeRecord('TRIP', data?.id); if (!trip) return false; let next; try { next = transitionTripStage(trip, 'RIDE_STARTED', { at: new Date().toISOString() }) } catch (_) { return false }; next.updatedAt = nextCanonicalTimestamp(trip.updatedAt); await commitNativeFirst('TRIP', next, { expectedUpdatedAt: trip.updatedAt }); return next })() : await ShiftTripRepository.setTripStage(data?.id, 'RIDE_STARTED')
    if (!nativeCanonicalAvailable() && result && typeof result === 'object') await mirrorCanonicalRecord('TRIP', result)
    checkpoint()
    if (result && typeof result === 'object' && result.tripStage === 'RIDE_STARTED') {
      captureAndPersistTripBoundary(result.id, 'tripStartLocation')
    }
    return result
  },
  async completeTrip(data) {
    const result = nativeCanonicalAvailable() ? await (async () => { const trip = await findNativeRecord('TRIP', data?.id); if (!trip) throw new Error('Trip not found.'); const now = new Date().toISOString(); const next = transitionTrip(trip, 'COMPLETED', data); next.tripEndAt = data.tripEndAt || trip.tripEndAt || now; next.updatedAt = nextCanonicalTimestamp(trip.updatedAt); await commitNativeFirst('TRIP', next, { expectedUpdatedAt: trip.updatedAt }); return true })() : await ShiftTripRepository.completeTrip({ ...data }); if (!nativeCanonicalAvailable()) await mirrorCanonicalTripById(data?.id); checkpoint()
    captureAndPersistTripBoundary(data?.id, 'tripEndLocation')
    return result
  },
  async cancelTrip(data) {
    const result = nativeCanonicalAvailable() ? await (async () => { const trip = await findNativeRecord('TRIP', data?.id); if (!trip) throw new Error('Trip not found.'); const now = new Date().toISOString(); const next = transitionTrip(trip, 'CANCELLED', data); next.tripEndAt = data.tripEndAt || trip.tripEndAt || now; next.updatedAt = nextCanonicalTimestamp(trip.updatedAt); await commitNativeFirst('TRIP', next, { expectedUpdatedAt: trip.updatedAt }); return true })() : await ShiftTripRepository.cancelTrip(data)
    if (!nativeCanonicalAvailable()) await mirrorCanonicalTripById(data?.id)
    checkpoint()
    captureAndPersistTripBoundary(data?.id, 'tripEndLocation')
    return result
  },
  async updateTrip(data) {
    const validation = validateTripCorrection(data)
    if (!validation.valid) return { ok: false, reason: validation.reason }
    const correction = { ...data, ...validation }; const result = nativeCanonicalAvailable() ? await (async () => { const trip = await findNativeRecord('TRIP', data?.id); if (!trip) throw new Error('Trip not found.'); if (!['COMPLETED', 'CANCELLED'].includes(trip.status)) throw new Error('Only completed or cancelled trips can be corrected.'); const next = correctNativeTrip(trip, correction, nextCanonicalTimestamp(trip.updatedAt)); await commitNativeFirst('TRIP', next, { expectedUpdatedAt: trip.updatedAt }); return true })() : await ShiftTripRepository.updateTrip(correction); if (!nativeCanonicalAvailable()) await mirrorCanonicalTripById(data?.id); checkpoint(); return result
  },
  async updateFuel(data) { const result = await FuelRepository.update(data.id, data); checkpoint(); return { ok: true, record: result } },
  async deleteFuel(id) { const result = await FuelRepository.remove(id); checkpoint(); return { ok: result } },
  async endShift(data) {
    if (nativeCanonicalAvailable()) {
      const snapshot = await readNativeWorkSnapshot()
      const shift = snapshot.shifts.find(item => item.id === data?.shiftId && item.status === 'ACTIVE')
      if (!shift) return { ok: false, reason: 'Active shift not found.' }
      const activeTrip = snapshot.trips.find(item => item.shiftId === shift.id && item.status === 'ACTIVE')
      if (activeTrip) return { ok: false, reason: 'ACTIVE_TRIP_IN_PROGRESS' }
      const validation = validateEndShiftEntry({
        closingOdometer: data?.closingOdometer,
        startOdometer: shift.startOdometer,
        confirmLargeDistance: data?.confirmLargeDistance,
      })
      if (!validation.valid) return {
        ok: false, reason: validation.reason,
        requiresConfirmation: validation.requiresConfirmation,
        distanceKm: validation.distanceKm,
      }
      const now = new Date().toISOString()
      const shiftTrips = snapshot.trips.filter(trip => trip.shiftId === shift.id)
      const revenue = deriveLiveRevenue(shiftTrips)
      const completedShift = {
        ...shift,
        revenue, liveFareRevenue: revenue, revenueSource: 'TRIP_FARES',
        revenueReconciliation: reconcileShiftRevenue({
          shiftRevenue: revenue, trips: shiftTrips, toll: shift.toll, parking: shift.parking,
          tollTreatment: shift.tollTreatment, parkingTreatment: shift.parkingTreatment,
          tollParkingCaptureMode: shift.tollParkingCaptureMode,
          tollParkingRevenueTreatment: shift.tollParkingRevenueTreatment,
        }),
        endOdometer: validation.closingOdometer,
        totalDistance: validation.closingOdometer - Number(shift.startOdometer),
        ...(data?.movementReconciliation ? { movementReconciliation: data.movementReconciliation } : {}),
        shiftEndAt: now,
        shiftDurationMs: Math.max(0, Date.parse(now) - Date.parse(shift.shiftStartAt || now)),
        status: 'COMPLETED', updatedAt: now,
      }
      // Commit terminal state to SQLite before refreshing the IndexedDB read model.
      await commitNativeFirst('SHIFT', completedShift, { expectedUpdatedAt: shift.updatedAt })
      checkpoint()
      captureAndPersistEventLocation('SHIFT', shift.id, 'SHIFT_END', now)
      return { ok: true, endOdometer: validation.closingOdometer, distanceKm: validation.distanceKm }
    }

    const active = await ShiftTripRepository.getActive()
    const result = await completeEndShift(data)
    checkpoint()
    if (result?.ok && active.shift?.id) {
      const localShifts = await ShiftTripRepository.getAllShifts({ skipCanonicalReadBoundary: true })
      const completedShift = localShifts.find(shift => shift.id === active.shift.id && shift.status === 'COMPLETED') || null
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
