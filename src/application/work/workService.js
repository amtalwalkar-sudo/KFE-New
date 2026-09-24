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
import { MovementAccountingService, routeTrace } from '../../domain/movement/movementAccounting.js'
import { ValhallaRoutingAdapter } from '../../infrastructure/location/valhallaRoutingAdapter.js'
import { calculateTraceDistanceKm } from '../../infrastructure/location/movementTraceService.js'

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
  async getTripGpsDistanceKm(tripId) { const snapshots = await LocationRepository.forEntity('TRIP', tripId); return calculateTraceDistanceKm(snapshots.filter(point => point?.eventType === 'PASSENGER_RIDE_TRACE')) },
  async captureLocation(data) { const result = await captureLifecycleLocation(data); checkpoint(); return result },
  validateShiftStartOdometer(currentOdometer, previousOdometer) { return validateShiftStartOdometer(currentOdometer, previousOdometer) },
  validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer) { return validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer) },
  validateGapAllocation(gapKm, personalKm, deadKm) { return validateGapAllocation(gapKm, personalKm, deadKm) },
  calculateFuelQuantity(pricePerKg, amount) { return calculateFuelQuantity({ pricePerKg, amount }) },
  async startShift(data) { const result = await ShiftTripRepository.createShift(data); checkpoint(); return result },
  async startTrip(data) {
    const validation = validateTripOperator(data?.operator)
    if (!validation.valid) return { ok: false, reason: validation.reason }
    const result = await ShiftTripRepository.createTrip({ ...data, operator: validation.operator }); checkpoint()
    const startLocation = await captureLifecycleLocation({ entityType: 'TRIP', entityId: result.id, eventType: 'START' })
    if (startLocation) {
      await ShiftTripRepository.setTripStartLocation(result.id, startLocation)
      result.tripStartLocation = { latitude: startLocation.latitude, longitude: startLocation.longitude, accuracy: startLocation.accuracy, placeName: startLocation.placeName, capturedAt: startLocation.capturedAt }
    }
    return result
  },
  async startRide(data) { const result = await ShiftTripRepository.setTripStage(data?.id, 'RIDE_STARTED'); checkpoint(); return result },
  async completeTrip(data) {
    const trip = await ShiftTripRepository.getTripsForShift(data?.shiftId || (await ShiftTripRepository.getActive()).shift?.id || '')
    const activeTrip = trip.find(item => item.id === data?.id) || (await ShiftTripRepository.getActive()).trip
    let completionData = { ...data }
    if (activeTrip?.id) {
      const snapshots = (await LocationRepository.forEntity('TRIP', activeTrip.id)).filter(point => point?.eventType === 'PASSENGER_RIDE_TRACE')
      if (snapshots.length >= 2) {
        const routed = await routeTrace(snapshots, new ValhallaRoutingAdapter())
        if (Number.isFinite(Number(routed.distanceKm))) {
          completionData = {
            ...completionData,
            tripKm: Number(routed.distanceKm),
            tripKmAuthority: 'GPS_ESTIMATE',
            tripKmProvenance: { ...routed.provenance, method: routed.method, confidence: routed.confidence, gpsTracePoints: routed.points.length }
          }
        }
      }
    }
    const result = await ShiftTripRepository.completeTrip(completionData); checkpoint(); return result
  },
  async cancelTrip(data) { const result = await ShiftTripRepository.cancelTrip(data); checkpoint(); return result },
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
      const gpsSnapshots = await LocationRepository.forEntity('SHIFT', active.shift.id)
      try {
        const reconciliation = await MovementAccountingService.reconcileShiftMovement({
          trips,
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
