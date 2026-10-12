import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
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
import { MovementAccountingService, routeTrace } from '../../domain/movement/movementAccounting.js'
import { WorkRuntimePorts } from './workRuntimePorts.js'
import { calculateTraceDistanceKm } from '../../domain/movement/traceDistance.js'
import { reconcileShiftRevenue } from '../../domain/work/revenueReconciliation.js'

const checkpoint = () => BackupService.requestLocalBackupCheckpoint()

export const WorkService = Object.freeze({
  getTripOperators() { return WORK_TRIP_OPERATORS },
  validateTripOperator(operator) { return validateTripOperator(operator) },
  validateTripCorrection(data) { return validateTripCorrection(data) },
  validateFuelEntry(data) { return validateFuelEntry(data) },
  async getActiveState() { return ShiftTripRepository.getActive() },
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
    for (const ownerId of owners) {
      const trip = tripById.get(ownerId)
      const shift = shiftById.get(ownerId)
      // Snapshot even the currently active trace into canonical IndexedDB so
      // backups include it. Keep the live JSONL file only for the active owner;
      // completed/orphaned files can be cleared after a successful import.
      const entityType = trip ? 'TRIP' : shift ? 'SHIFT' : null
      if (!entityType) continue
      const activeOwner = trip?.status === 'ACTIVE' || (shift?.status === 'ACTIVE' && !activeTrip)
      try {
        const result = await WorkRuntimePorts.nativeGps.syncTrace(ownerId, { entityType, clearAfterImport: !activeOwner })
        const imported = Number(result?.imported) || 0
        if (imported > 0) checkpoint()
        recovered.push({ ownerId, entityType, imported })
      } catch (error) {
        console.warn('KFE native GPS trace recovery deferred; source file retained:', ownerId, error)
      }
    }
    return { ownersChecked: owners.length, recovered }
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
  async getTripGpsDistanceKm(tripId) { try { await WorkRuntimePorts.nativeGps.syncTrace(tripId) } catch (_) {} const snapshots = await LocationRepository.forEntity('TRIP', tripId); return calculateTraceDistanceKm(snapshots.filter(point => point?.eventType === 'PASSENGER_RIDE_TRACE')) },
  calculateLiveMovement(points = []) { const filteredPoints = MovementAccountingService.filterGpsTrace(points); return { points: filteredPoints, distanceKm: calculateTraceDistanceKm(filteredPoints) } },
  async captureLocation(data) { const result = await captureLifecycleLocation(data); checkpoint(); return result },
  validateShiftStartOdometer(currentOdometer, previousOdometer) { return validateShiftStartOdometer(currentOdometer, previousOdometer) },
  validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer) { return validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer) },
  validateGapAllocation(gapKm, category) { return validateGapAllocation(gapKm, category) },
  calculateFuelQuantity(pricePerKg, amount) { return calculateFuelQuantity({ pricePerKg, amount }) },
  calculateTraceDistanceKm(points = []) { return calculateTraceDistanceKm(points) },
  reconcileShiftRevenue(data) { return reconcileShiftRevenue(data) },
  async startShift(data) { const result = await ShiftTripRepository.createShift(data); checkpoint(); return result },
  async startTrip(data) {
    const validation = validateTripOperator(data?.operator)
    if (!validation.valid) return { ok: false, reason: validation.reason }
    const result = await ShiftTripRepository.createTrip({ ...data, operator: validation.operator, tripStage: data?.tripStage || 'GOING_TO_PICKUP' }); checkpoint()
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
    checkpoint()
    if (!result || !data?.id) return result
    // Android uses the native foreground trace. Browser/PWA builds do not have
    // that plugin, so fall back to the existing web movement-trace service.
    void WorkRuntimePorts.nativeGps.start(data.id, 'PASSENGER_RIDE_TRACE', 'TRIP').then(started => {
      if (started) return
      WorkRuntimePorts.movementTrace.start({ entityType: 'TRIP', entityId: data.id, eventType: 'PASSENGER_RIDE_TRACE', profile: 'PASSENGER_RIDE' })
    }).catch(() => {
      try { WorkRuntimePorts.movementTrace.start({ entityType: 'TRIP', entityId: data.id, eventType: 'PASSENGER_RIDE_TRACE', profile: 'PASSENGER_RIDE' }) } catch (_) {}
    })
    return result
  },
  async completeTrip(data) {
    // Commit the terminal state first. GPS is enrichment only: never hold the swipe
    // transition or the pending-fare form open while native trace synchronization runs.
    const result = await ShiftTripRepository.completeTrip({ ...data }); checkpoint()
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
          const nativeSync = await WorkRuntimePorts.nativeGps.syncTrace(tripId)
          if (Number(nativeSync?.imported) > 0 || browserTracePoints.length > 0) checkpoint()
          await WorkRuntimePorts.nativeGps.stop(tripId)
          let snapshots = (await LocationRepository.forEntity('TRIP', tripId)).filter(point => point?.eventType === 'PASSENGER_RIDE_TRACE')
          const finalTracePoint = snapshots.at(-1) || browserTracePoints.at(-1)
          if (finalTracePoint) {
            await ShiftTripRepository.setTripEndLocation(tripId, finalTracePoint)
          } else {
            const endLocation = await captureLifecycleLocation({ entityType: 'TRIP', entityId: tripId, eventType: 'END' })
            if (endLocation) await ShiftTripRepository.setTripEndLocation(tripId, endLocation)
          }
          if (snapshots.length < 2) return

          const gpsKm = calculateTraceDistanceKm(snapshots)
          const router = WorkRuntimePorts.routing.createRouter()
          const routed = await routeTrace(snapshots, router)

          if (Number.isFinite(Number(routed.distanceKm)) && Number(routed.distanceKm) >= 0) {
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

          if (Number.isFinite(Number(gpsKm)) && gpsKm >= 0) {
            await ShiftTripRepository.enrichTripMovement({
              id: tripId,
              tripKm: Number(gpsKm),
              tripKmAuthority: 'GPS_LINE_TRACE',
              tripKmProvenance: {
                method: 'HAVERSINE_TRACE_SUM',
                confidence: 'ESTIMATED_TRACE',
                gpsTracePoints: snapshots.length,
                source: 'ANDROID_NATIVE_GPS'
              },
              roadMatchedGeometry: null,
              traceGeometry: snapshots.map(point => [Number(point.longitude), Number(point.latitude)])
            })
          }
        } catch (_) {
          // Completion is already persisted. Valhalla/network/GPS enrichment must
          // never block, undo, or delay the fare form or swipe transition.
        }
      })()
    }
    return result
  },
  async cancelTrip(data) { const result = await ShiftTripRepository.cancelTrip(data); checkpoint(); if (data?.id) { void (async () => { try { const activeTrace = WorkRuntimePorts.movementTrace.getActiveSession(); if (activeTrace?.entityType === 'TRIP' && activeTrace.entityId === data.id) { await WorkRuntimePorts.movementTrace.stop({ captureFinal: false }) } const sync = await WorkRuntimePorts.nativeGps.syncTrace(data.id); if (Number(sync?.imported) > 0) checkpoint(); await WorkRuntimePorts.nativeGps.stop(data.id) } catch (_) {} })() } return result },
  async updateTrip(data) {
    const validation = validateTripCorrection(data)
    if (!validation.valid) return { ok: false, reason: validation.reason }
    const result = await ShiftTripRepository.updateTrip({ ...data, ...validation }); checkpoint(); return result
  },
  async updateFuel(data) { const result = await FuelRepository.update(data.id, data); checkpoint(); return { ok: true, record: result } },
  async deleteFuel(id) { const result = await FuelRepository.remove(id); checkpoint(); return { ok: result } },
  async endShift(data) {
    let completionData = { ...data }
    const active = await ShiftTripRepository.getActive()
    if (active.shift?.id) {
      const trips = await ShiftTripRepository.getTripsForShift(active.shift.id)
      const corrections = new Map((data.trips || []).filter(item => item?.id).map(item => [item.id, item]))
      const movementTrips = trips.map(trip => corrections.has(trip.id) ? { ...trip, ...corrections.get(trip.id), tripKm: corrections.get(trip.id).tripKm === '' ? trip.tripKm : corrections.get(trip.id).tripKm } : trip)
      const shiftGpsSnapshots = await LocationRepository.forEntity('SHIFT', active.shift.id)
      const tripGpsSnapshots = (await Promise.all(movementTrips.map(trip => LocationRepository.forEntity('TRIP', trip.id)))).flat()
      const gpsSnapshots = [...shiftGpsSnapshots, ...tripGpsSnapshots]
      try {
        const reconciliation = await MovementAccountingService.reconcileShiftMovement({
          trips: movementTrips,
          startOdometer: active.shift.startOdometer,
          endOdometer: data?.closingOdometer,
          router: WorkRuntimePorts.routing.createRouter(),
          businessKmByTripId: Object.fromEntries(movementTrips.filter(item => item.tripKm != null && item.tripKm !== '' && Number.isFinite(Number(item.tripKm)) && Number(item.tripKm) >= 0).map(item => [item.id, Number(item.tripKm)])),
          gpsSnapshots
        })
        completionData.movementReconciliation = reconciliation
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
    const result = await completeEndShift(completionData); checkpoint(); return result
  },
  async recordFuel(data) {
    const result = await recordFuelEntry(data)
    // Fuel persistence is the user-visible commit. Local backup is best-effort
    // follow-up work and must not hold the form open after the record is saved.
    void Promise.resolve().then(() => checkpoint()).catch(() => {})
    return result
  },
})
