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
    const revenue = Number.isFinite(Number(shift.revenue)) ? Number(shift.revenue) : 0
    // Shift-level and trip-level toll/parking are both canonical cost records.
    // Keep the Timeline read model aligned with Performance: both are included.
    const tripToll = tripAmount(terminal, 'toll')
    const tripParking = tripAmount(terminal, 'parking')
    const toll = Number(shift.toll || 0) + tripToll
    const parking = Number(shift.parking || 0) + tripParking
    const invalidTripKm = completed.some(trip => {
      if (trip.tripKm == null || trip.tripKm === '') return true
      const km = Number(trip.tripKm)
      return !Number.isFinite(km) || km < 0
    })
    const businessKm = invalidTripKm
      ? NaN
      : completed.reduce((sum, trip) => sum + Number(trip.tripKm), 0)
    const vehicleKm = shift.endOdometer == null ? null : finiteNonNegative(Number(shift.endOdometer) - Number(shift.startOdometer), 'vehicleKm')
    const deadKm = vehicleKm == null || invalidTripKm ? null : vehicleKm - businessKm
    if (deadKm != null && deadKm < 0) throw new Error('Derived deadKm cannot be negative.')

    const relevantFuel = fuelForShift(fuelLogs, shift)
    const fuelQuantityKg = relevantFuel.reduce((sum, log) => sum + Number(log.quantityKg || 0), 0)
    const fuelCost = relevantFuel.reduce((sum, log) => sum + Number(log.amount || 0), 0)

    return {
      shift,
      trips,
      completedTrips: completed,
      revenue,
      businessKm,
      vehicleKm,
      deadKm,
      fuelLogs: relevantFuel,
      fuelQuantityKg,
      fuelCost,
      toll,
      parking,
      unavailable: {
        vehicleKm: vehicleKm == null,
        businessKm: !Number.isFinite(businessKm),
        deadKm: deadKm == null
      }
    }
  }
}
