import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
import { FuelRepository } from '../../repositories/fuelRepository.js'
import { LocationRepository } from '../../repositories/locationRepository.js'
import { captureLifecycleLocation } from './location.js'
import { completeEndShift } from './endShift.js'
import { recordFuelEntry } from './fuel.js'
import { validateShiftStartOdometer, validateFirstDayShiftStartOdometer, validateGapAllocation } from '../../domain/work/shift.js'
import { calculateFuelQuantity, validateFuelEntry } from '../../domain/work/fuel.js'
import { WORK_TRIP_OPERATORS, validateTripOperator, validateTripCorrection } from '../../domain/work/trip.js'
import { BackupService } from '../backup/backupService.js'
import { MovementAccountingService } from '../../domain/movement/movementAccounting.js'
import { calculateTraceDistanceKm } from '../../infrastructure/location/movementTraceService.js'
import { NativeGpsService } from '../../infrastructure/android/nativeGpsService.js'
import { ValhallaRoutingAdapter } from '../../infrastructure/location/valhallaRoutingAdapter.js'
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
  async getFuelLogs() { return FuelRepository.getAll() },
  async getLocations(entityType, entityId) { return LocationRepository.forEntity(entityType, entityId) },
  async previewMovementReconciliation({ shiftId, closingOdometer, trips = [] }) {
    const shift = await ShiftTripRepository.getActive()
    if (!shift?.shift?.id || shift.shift.id !== shiftId) return { reconciliationStatus: 'UNAVAILABLE', reason: 'ACTIVE_SHIFT_NOT_FOUND' }
    const gpsSnapshots = await LocationRepository.forEntity('SHIFT', shiftId)
    try {
      return await MovementAccountingService.reconcileShiftMovement({
        trips,
        startOdometer: shift.shift.startOdometer,
        endOdometer: closingOdometer,
        router: new ValhallaRoutingAdapter(),
        businessKmByTripId: Object.fromEntries(trips.filter(item => Number.isFinite(Number(item.tripKm)) && Number(item.tripKm) >= 0).map(item => [item.id, Number(item.tripKm)])),
        gpsSnapshots
      })
    } catch (error) {
      return { reconciliationStatus: 'UNAVAILABLE', reason: error?.message || 'MOVEMENT_RECONCILIATION_FAILED', gpsTracePoints: gpsSnapshots.length }
    }
  },
  async getTripGpsDistanceKm(tripId) { const snapshots = await LocationRepository.forEntity('TRIP', tripId); return calculateTraceDistanceKm(snapshots.filter(point => point?.eventType === 'PASSENGER_RIDE_TRACE')) },
  async captureLocation(data) { const result = await captureLifecycleLocation(data); checkpoint(); return result },
  validateShiftStartOdometer(currentOdometer, previousOdometer) { return validateShiftStartOdometer(currentOdometer, previousOdometer) },
  validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer) { return validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer) },
  validateGapAllocation(gapKm, personalKm, deadKm) { return validateGapAllocation(gapKm, personalKm, deadKm) },
  calculateFuelQuantity(pricePerKg, amount) { return calculateFuelQuantity({ pricePerKg, amount }) },
  reconcileShiftRevenue(data) { return reconcileShiftRevenue(data) },
  async startShift(data) { const result = await ShiftTripRepository.createShift(data); checkpoint(); return result },
  async startTrip(data) {
    const validation = validateTripOperator(data?.operator)
    if (!validation.valid) return { ok: false, reason: validation.reason }
    const result = await ShiftTripRepository.createTrip({ ...data, operator: validation.operator, tripStage: data?.tripStage || 'PICKUP' }); checkpoint()
    // GPS is telemetry/enrichment. Never block the authoritative trip transition on it.
    void captureLifecycleLocation({ entityType: 'TRIP', entityId: result.id, eventType: 'START' }).then(location => {
      if (location) return ShiftTripRepository.setTripStartLocation(result.id, location)
      return null
    }).catch(() => {})
    return result
  },
  async startRide(data) { const result = await ShiftTripRepository.setTripStage(data?.id, 'RIDE_STARTED'); checkpoint(); void NativeGpsService.start(data?.id).catch(() => {}); return result },
  async recordFareForActiveTrip(data) {
    const validation = validateTripCorrection({ revenue: data?.revenue })
    if (!validation.valid) return { ok: false, reason: validation.reason }
    try {
      const result = await ShiftTripRepository.recordFareForActiveTrip({ id: data?.id, revenue: validation.revenue })
      checkpoint()
      return { ok: true, record: result }
    } catch (error) {
      return { ok: false, reason: error?.message || 'Trip fare could not be saved.' }
    }
  },
  async completeTrip(data) {
    // Persist the terminal trip state first. GPS/native trace enrichment is deliberately
    // detached so END TRIP can hand control to the mandatory fare form immediately.
    const result = await ShiftTripRepository.completeTrip({ ...data }); checkpoint()
    const tripId = data?.id
    if (tripId) {
      void (async () => {
        try {
          await NativeGpsService.syncTrace(tripId)
          await NativeGpsService.stop(tripId)
          const snapshots = (await LocationRepository.forEntity('TRIP', tripId)).filter(point => point?.eventType === 'PASSENGER_RIDE_TRACE')
          if (snapshots.length >= 2) {
            const lineKm = calculateTraceDistanceKm(snapshots)
            if (Number.isFinite(Number(lineKm))) {
              await ShiftTripRepository.updateTrip({
                id: tripId,
                tripKm: Number(lineKm),
                tripKmAuthority: 'GPS_LINE_TRACE',
                tripKmProvenance: { method: 'HAVERSINE_TRACE_SUM', gpsTracePoints: snapshots.length, source: 'WEB_AND_ANDROID_NATIVE' }
              })
            }
          }
        } catch (_) {}
      })()
    }
    return result
  },
  async cancelTrip(data) { const result = await ShiftTripRepository.cancelTrip(data); checkpoint(); if (data?.id) { void (async () => { try { void (async () => { try { await NativeGpsService.syncTrace(data.id); await NativeGpsService.stop(data.id) } catch (_) {} })() } catch (_) {} })() } return result },
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
      const gpsSnapshots = await LocationRepository.forEntity('SHIFT', active.shift.id)
      try {
        const reconciliation = await MovementAccountingService.reconcileShiftMovement({
          trips: movementTrips,
          startOdometer: active.shift.startOdometer,
          endOdometer: data?.closingOdometer,
          router: new ValhallaRoutingAdapter(),
          businessKmByTripId: Object.fromEntries(trips.filter(item => Number.isFinite(Number(item.tripKm)) && Number(item.tripKm) >= 0).map(item => [item.id, Number(item.tripKm)])),
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
  async recordFuel(data) { const result = await recordFuelEntry(data); checkpoint(); return result },
})
