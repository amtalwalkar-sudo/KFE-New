import { deriveLiveRevenue } from '../../domain/work/liveRevenue.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
import { FuelRepository } from '../../repositories/fuelRepository.js'

const completedTrips = trips => trips.filter(trip => trip.status === 'COMPLETED')
const terminalTrips = trips => trips.filter(trip => trip.status === 'COMPLETED' || trip.status === 'CANCELLED')
const tripAmount = (trips, field) => trips.reduce((total, trip) => { const value = Number(trip?.[field]); return total + (Number.isFinite(value) && value >= 0 ? value : 0) }, 0)
const finiteNonNegative = (value, field) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} must be a non-negative finite number.`)
  return number
}

function fuelForShift(fuelLogs, shift) {
  const start = finiteNonNegative(shift.startOdometer, 'startOdometer')
  const end = shift.endOdometer == null ? Infinity : finiteNonNegative(shift.endOdometer, 'endOdometer')
  return fuelLogs.filter(log => Number.isFinite(Number(log.odometer)) && Number(log.odometer) >= start && Number(log.odometer) <= end)
}

export const OperationalRecordService = {
  async startShift(data) {
    return ShiftTripRepository.createShift(data)
  },

  async completeShift(data) {
    return ShiftTripRepository.completeShift(data)
  },

  async recordFuel(data) {
    return FuelRepository.create(data)
  },

  async reconstructShift(shiftId) {
    if (!shiftId) throw new Error('shiftId is required for operational reconstruction.')
    const shifts = await ShiftTripRepository.getAllShifts()
    const shift = shifts.find(item => item.id === shiftId)
    if (!shift) throw new Error('Shift not found.')

    const [trips, fuelLogs] = await Promise.all([
      ShiftTripRepository.getTripsForShift(shiftId),
      FuelRepository.getAll()
    ])
    const completed = completedTrips(trips)
    const terminal = terminalTrips(trips)
    const storedRevenue = Number.isFinite(Number(shift.revenue)) ? Number(shift.revenue) : 0
    const revenue = shift.revenueSource === 'TRIP_FARES' ? storedRevenue : deriveLiveRevenue(trips)
    const legacyRevenue = shift.revenueSource !== 'TRIP_FARES' && storedRevenue > 0
      ? { legacyRevenueSnapshot: shift.legacyRevenueSnapshot ?? storedRevenue, legacyRevenueMigrationStatus: shift.legacyRevenueMigrationStatus || 'REVIEW_REQUIRED' }
      : {}
    const readShift = shift.revenueSource === 'TRIP_FARES'
      ? shift
      : { ...shift, ...legacyRevenue, revenue, liveFareRevenue: revenue, revenueSource: 'TRIP_FARES' }
    // Shift-level and trip-level toll/parking are both canonical cost records.
    // Keep the Timeline read model aligned with Performance: both are included.
    const tripToll = tripAmount(terminal, 'toll')
    const tripParking = tripAmount(terminal, 'parking')
    const additionalOnly = shift.tollParkingCaptureMode === 'ADDITIONAL_ONLY'
    // Older Shift.toll/parking may already include trip-level amounts.
    // Only current additional-only records are summed with Trip expenses.
    const toll = additionalOnly ? Number(shift.toll || 0) + tripToll : Math.max(Number(shift.toll || 0), tripToll)
    const parking = additionalOnly ? Number(shift.parking || 0) + tripParking : Math.max(Number(shift.parking || 0), tripParking)
    const invalidTripKm = completed.some(trip => {
      if (trip.tripKm == null || trip.tripKm === '') return true
      const km = Number(trip.tripKm)
      return !Number.isFinite(km) || km < 0
    })
    const vehicleKm = shift.endOdometer == null ? null : finiteNonNegative(Number(shift.endOdometer) - Number(shift.startOdometer), 'vehicleKm')
    const reconciliation = shift.movementReconciliation
    const reconciledSegments = Array.isArray(reconciliation?.segments)
      && ['RECONCILED', 'OVER_ESTIMATE'].includes(reconciliation.reconciliationStatus)
      ? reconciliation.segments
      : null
    const segmentTotal = classification => (reconciledSegments || [])
      .filter(segment => segment.classification === classification)
      .reduce((sum, segment) => sum + (Number.isFinite(Number(segment.distanceKm)) && Number(segment.distanceKm) >= 0 ? Number(segment.distanceKm) : 0), 0)
    // Timeline must consume the same persisted movement authority as Performance.
    // Without a valid reconciliation, only known trip KM is business KM; the
    // remaining odometer distance is not automatically proven to be dead KM.
    const businessKm = reconciledSegments
      ? segmentTotal('BUSINESS')
      : invalidTripKm ? NaN : completed.reduce((sum, trip) => sum + Number(trip.tripKm), 0)
    const deadKm = reconciledSegments
      ? segmentTotal('DEAD')
      : null
    const cancelledKm = reconciledSegments ? segmentTotal('CANCELLED') : tripAmount(terminal.filter(trip => trip.status === 'CANCELLED'), 'tripKm')
    const unclassifiedKm = reconciledSegments
      ? segmentTotal('UNCLASSIFIED')
      : vehicleKm == null || !Number.isFinite(businessKm) ? null : Math.max(0, vehicleKm - businessKm - cancelledKm)
    if (deadKm != null && deadKm < 0) throw new Error('Derived deadKm cannot be negative.')

    const relevantFuel = fuelForShift(fuelLogs, shift)
    const fuelQuantityKg = relevantFuel.reduce((sum, log) => sum + Number(log.quantityKg || 0), 0)
    const fuelCost = relevantFuel.reduce((sum, log) => sum + Number(log.amount || 0), 0)

    return {
      shift: readShift,
      trips,
      completedTrips: completed,
      revenue,
      businessKm,
      vehicleKm,
      deadKm,
      cancelledKm,
      unclassifiedKm,
      movementReconciliationStatus: reconciliation?.reconciliationStatus || 'LEGACY_UNRECONCILED',
      fuelLogs: relevantFuel,
      fuelQuantityKg,
      fuelCost,
      toll,
      parking,
      unavailable: {
        vehicleKm: vehicleKm == null,
        businessKm: !Number.isFinite(businessKm),
        deadKm: deadKm == null,
        movementReconciliation: !reconciledSegments,
        unclassifiedKm: unclassifiedKm == null || unclassifiedKm > 0
      }
    }
  }
}
