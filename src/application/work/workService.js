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
const mirrorCanonicalRecord = async (entityType, record) => {
  if (!record?.id || !nativeCanonicalAvailable()) return record
  const outcome = await CanonicalWorkBoundary.putRecord({ operationId: CanonicalWorkBoundary.createOperationId(), entityType, record })
  if (outcome?.accepted !== true) throw new Error(`Native canonical ${entityType} commit was not acknowledged.`)
  return record
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
    // GPS is telemetry/enrichment. Never block the authoritative trip transition on it.
    void WorkRuntimePorts.nativeGps.start(result.id, 'DEAD_MOVEMENT_TRACE', 'TRIP').catch(() => {})
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
    // Android uses the native foreground trace. Browser/PWA builds do not have
    // that plugin, so fall back to the existing web movement-trace service.
    void WorkRuntimePorts.nativeGps.start(data.id, 'PASSENGER_RIDE_TRACE', 'TRIP').then(started => {
      // Android background/screen-off collection is a native capability. If its
      // service is unavailable, surface the native failure rather than silently
      // substituting foreground browser geolocation and implying equivalent coverage.
      if (started || isAndroidRuntime()) {
        if (!started && isAndroidRuntime()) console.warn('Android native GPS did not start; browser tracking is not a background-equivalent fallback.')
        return
      }
      // Browser/PWA collection is intentionally foreground-only and independent.
      WorkRuntimePorts.movementTrace.start({ entityType: 'TRIP', entityId: data.id, eventType: 'PASSENGER_RIDE_TRACE', profile: 'PASSENGER_RIDE' })
    }).catch(error => {
      if (isAndroidRuntime()) {
        console.warn('Android native GPS start failed; not substituting PWA tracking:', error)
        return
      }
      try { WorkRuntimePorts.movementTrace.start({ entityType: 'TRIP', entityId: data.id, eventType: 'PASSENGER_RIDE_TRACE', profile: 'PASSENGER_RIDE' }) } catch (_) {}
    })
    return result
  },
  async completeTrip(data) {
    // Commit the terminal state first. GPS is enrichment only: never hold the swipe
    // transition or the pending-fare form open while native trace synchronization runs.
    const result = await ShiftTripRepository.completeTrip({ ...data }); await mirrorCanonicalShiftByTripId(data?.id); checkpoint()
    const tripId = data?.id
    if (tripId) {
      void (async () => {
        try {
          // Native GPS is the raw evidence. Synchronize it first, then enrich the
          // already-committed trip asynchronously. Nothing here is awaited by the
          // authoritative END TRIP transition or the pending-fare form.
          const activeTrace = WorkRuntimePorts.movementTrace.getActiveSession()
          let browserTracePoints = []
          if (activeTrace?.entityType === 'TRIP' && activeTrace.entityId === tripId) {
            try { browserTracePoints = await WorkRuntimePorts.movementTrace.stop({ captureFinal: true }) } catch (_) {}
          }
          // Stop is an acknowledged native lifecycle transition, not merely a queued Intent.
          // Only read/import the final JSONL after callbacks have been detached.
          await WorkRuntimePorts.nativeGps.stop(tripId)
          const nativeSync = await WorkRuntimePorts.nativeGps.syncTrace(tripId, { clearAfterImport: true })
          if (Number(nativeSync?.imported) > 0 || browserTracePoints.length > 0) checkpoint()
          let snapshots = (await LocationRepository.forEntity('TRIP', tripId)).filter(point => point?.eventType === 'PASSENGER_RIDE_TRACE')
          // Capture a fresh END location while the user is still in the foreground.
          // The last persisted trace point may be stale by minutes/hours and must
          // never be mistaken for the actual trip endpoint.
          const endLocation = await captureLifecycleLocation({ entityType: 'TRIP', entityId: tripId, eventType: 'END' }).catch(() => null)
          if (endLocation) {
            await ShiftTripRepository.setTripEndLocation(tripId, endLocation)
            await mirrorCanonicalTripById(tripId)
            checkpoint()
          } else {
            // _finishTrip persisted tripEndLocationStatus=MISSING with the terminal
            // transition. Never relabel an older trace point as a fresh endpoint fix.
            console.warn('Trip completed without a fresh endpoint GPS fix:', tripId)
          }

          const active = await ShiftTripRepository.getActive()
          const shiftTrips = active.shift?.id ? await ShiftTripRepository.getTripsForShift(active.shift.id) : []
          const completedTrip = shiftTrips.find(item => item.id === tripId)
          const traceQuality = assessGpsTraceCompleteness(snapshots, {
            startAt: completedTrip?.tripStartAt,
            endAt: completedTrip?.tripEndAt || data?.tripEndAt
          })
          if (!traceQuality.complete) {
            await ShiftTripRepository.invalidateGpsTripMovement({ id: tripId, reason: traceQuality.reason, traceQuality })
            console.warn('Trip GPS distance withheld because trace coverage is incomplete:', tripId, traceQuality)
            return
          }

          const usableGpsPoints = MovementAccountingService.filterGpsTrace(snapshots)
          const gpsKm = usableGpsPoints.length >= 2 ? calculateTraceDistanceKm(usableGpsPoints) : null
          const router = WorkRuntimePorts.routing.createRouter()
          const routed = await routeTrace(snapshots, router)

          if (isUsableDistanceKm(routed.distanceKm) && (routed.points?.length || 0) >= 2) {
            await ShiftTripRepository.enrichTripMovement({
              id: tripId,
              tripKm: Number(routed.distanceKm),
              tripKmAuthority: routed.roadMatchedGeometry ? 'VALHALLA_ROAD_TRACE' : 'GPS_LINE_TRACE',
              tripKmProvenance: {
                ...(routed.provenance || {}),
                method: routed.method,
                confidence: routed.confidence,
                gpsTracePoints: routed.points?.length || snapshots.length,
                fallbackGpsKm: Number.isFinite(Number(gpsKm)) ? Number(gpsKm) : null,
                source: browserTracePoints.length > 0 ? 'BROWSER_GEOLOCATION' : 'ANDROID_NATIVE_GPS'
              },
              roadMatchedGeometry: routed.roadMatchedGeometry || null,
              traceGeometry: routed.traceGeometry || []
            })
            return
          }

          if (usableGpsPoints.length >= 2 && isUsableDistanceKm(gpsKm)) {
            await ShiftTripRepository.enrichTripMovement({
              id: tripId,
              tripKm: Number(gpsKm),
              tripKmAuthority: 'GPS_LINE_TRACE',
              tripKmProvenance: {
                method: 'HAVERSINE_TRACE_SUM',
                confidence: 'ESTIMATED_TRACE',
                gpsTracePoints: usableGpsPoints.length,
                source: browserTracePoints.length > 0 ? 'BROWSER_GEOLOCATION' : 'ANDROID_NATIVE_GPS'
              },
              roadMatchedGeometry: null,
              traceGeometry: usableGpsPoints.map(point => [Number(point.longitude), Number(point.latitude)])
            })
          }
        } catch (error) {
          // Completion is already persisted. Valhalla/network/GPS enrichment must
          // never block, undo, or delay the fare form or swipe transition. The raw
          // native file remains on disk if import failed and startup can retry it.
          console.warn('Trip GPS enrichment deferred; native trace retained for recovery:', tripId, error)
        } finally {
          try { await WorkRuntimePorts.nativeGps.stop(tripId) } catch (_) {}
        }
      })()
    }
    return result
  },
  async cancelTrip(data) {
    const result = await ShiftTripRepository.cancelTrip(data)
    await mirrorCanonicalShiftByTripId(data?.id)
    checkpoint()
    if (data?.id) {
      void (async () => {
        try {
          const activeTrace = WorkRuntimePorts.movementTrace.getActiveSession()
          if (activeTrace?.entityType === 'TRIP' && activeTrace.entityId === data.id) {
            await WorkRuntimePorts.movementTrace.stop({ captureFinal: false })
          }
          await WorkRuntimePorts.nativeGps.stop(data.id)
          const sync = await WorkRuntimePorts.nativeGps.syncTrace(data.id, { clearAfterImport: true })
          if (Number(sync?.imported) > 0) checkpoint()
        } catch (error) {
          console.warn('Cancelled trip GPS sync deferred; native trace retained for recovery:', data.id, error)
        } finally {
          try { await WorkRuntimePorts.nativeGps.stop(data.id) } catch (_) {}
          // Returning to the online/waiting state intentionally leaves GPS capture off.
          // The next explicit Going to Pickup action starts a fresh dead-movement trace.
        }
      })()
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
    let completionData = { ...data }
    const active = await ShiftTripRepository.getActive()
    if (active.shift?.id) {
      const trips = await ShiftTripRepository.getTripsForShift(active.shift.id)
      let traceRecoveryError = null
      try {
        // Import any remaining native traces before internal movement accounting.
        // This remains background accounting, not a driver-facing reconciliation step.
        const owners = await WorkRuntimePorts.nativeGps.listTraceOwners()
        const tripById = new Map(trips.map(trip => [trip.id, trip]))
        for (const ownerId of owners) {
          const tripOwner = tripById.get(ownerId)
          if (ownerId !== active.shift.id && !tripOwner) continue
          const entityType = ownerId === active.shift.id ? 'SHIFT' : 'TRIP'
          await WorkRuntimePorts.nativeGps.syncTrace(ownerId, {
            entityType,
            clearAfterImport: entityType === 'SHIFT' || tripOwner?.status !== 'ACTIVE'
          })
        }
      } catch (error) {
        traceRecoveryError = error
        console.warn('Final shift GPS trace recovery incomplete; preserving source evidence:', error)
      }
      const shiftGpsSnapshots = await LocationRepository.forEntity('SHIFT', active.shift.id)
      const tripGpsSnapshots = (await Promise.all(trips.map(trip => LocationRepository.forEntity('TRIP', trip.id)))).flat()
      const gpsSnapshots = [...shiftGpsSnapshots, ...tripGpsSnapshots]
      try {
        if (traceRecoveryError) throw new Error('GPS_TRACE_RECOVERY_FAILED: ' + (traceRecoveryError?.message || 'Unknown trace recovery error'))
        completionData.movementReconciliation = await MovementAccountingService.reconcileShiftMovement({
          trips,
          startOdometer: active.shift.startOdometer,
          endOdometer: data?.closingOdometer,
          router: WorkRuntimePorts.routing.createRouter(),
          businessKmByTripId: Object.fromEntries(trips.filter(item => item.tripKm != null && item.tripKm !== '' && Number.isFinite(Number(item.tripKm)) && Number(item.tripKm) >= 0).map(item => [item.id, Number(item.tripKm)])),
          gpsSnapshots
        })
      } catch (error) {
        completionData.movementReconciliation = {
          reconciliationStatus: 'UNAVAILABLE',
          reason: error?.message || 'MOVEMENT_RECONCILIATION_FAILED',
          authoritativeOdometerKm: null,
          deadMilesKm: 0,
          businessMilesKm: 0,
          cancelledMilesKm: 0,
          unclassifiedKm: null,
          gpsTracePoints: gpsSnapshots.length
        }
      }
    }
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
