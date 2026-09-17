import { validateEndShiftEntry } from '../../domain/work/endShift.js'
import { validateTripCorrection, calculateShiftRevenue } from '../../domain/work/trip.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'

export async function completeEndShift({ shiftId, closingOdometer, toll, parking, tollParkingRevenueTreatment, trips = [], confirmLargeDistance = false }) {
  const active = await ShiftTripRepository.getActive()
  if (!active.shift || active.shift.id !== shiftId) return { ok: false, reason: 'Active shift not found.' }

  const validation = validateEndShiftEntry({ closingOdometer, startOdometer: active.shift.startOdometer, confirmLargeDistance })
  if (!validation.valid) return { ok: false, reason: validation.reason, requiresConfirmation: validation.requiresConfirmation, distanceKm: validation.distanceKm }

  const existingTrips = await ShiftTripRepository.getTripsForShift(shiftId)
  const correctionById = new Map()
  for (const correction of trips.filter(item => item?.id)) {
    const tripValidation = validateTripCorrection(correction)
    if (!tripValidation.valid) return { ok: false, reason: tripValidation.reason }
    correctionById.set(correction.id, tripValidation)
  }

  const completedTrips = existingTrips.filter(trip => trip.status === 'COMPLETED')
  const projectedTrips = completedTrips.map(trip => ({ ...trip, ...(correctionById.get(trip.id) || {}) }))
  const revenue = calculateShiftRevenue(projectedTrips)

  try {
    await ShiftTripRepository.completeShift({
      id: shiftId,
      endOdometer: validation.closingOdometer,
      revenue,
      toll,
      parking,
      tollParkingRevenueTreatment,
      trips: [...correctionById.entries()].map(([id, correction]) => ({ id, ...correction }))
    })
    return { ok: true, revenue }
  } catch (error) {
    return { ok: false, reason: error?.message || 'END_SHIFT_FAILED' }
  }
}
