import { validateEndShiftEntry } from '../../domain/work/endShift.js'
import { validateTripCorrection } from '../../domain/work/trip.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
import { reconcileShiftRevenue } from '../../domain/work/revenueReconciliation.js'

export async function completeEndShift({ shiftId, closingOdometer, revenue, toll, parking, tollParkingRevenueTreatment, trips = [], confirmLargeDistance = false, movementReconciliation = null }) {
  const active = await ShiftTripRepository.getActive()
  if (!active.shift || active.shift.id !== shiftId) return { ok: false, reason: 'Active shift not found.' }
  if (active.trip) return { ok: false, reason: 'ACTIVE_TRIP_IN_PROGRESS' }

  const validation = validateEndShiftEntry({ closingOdometer, startOdometer: active.shift.startOdometer, revenue, confirmLargeDistance })
  if (!validation.valid) return { ok: false, reason: validation.reason, requiresConfirmation: validation.requiresConfirmation, distanceKm: validation.distanceKm }

  const shiftRevenue = revenue === '' || revenue == null ? NaN : Number(revenue)
  if (!Number.isFinite(shiftRevenue) || shiftRevenue < 0) return { ok: false, reason: 'Total shift revenue is required and must be a non-negative number.' }

  const existingTrips = await ShiftTripRepository.getTripsForShift(shiftId)
  const correctionById = new Map()
  for (const correction of trips.filter(item => item?.id)) {
    const tripValidation = validateTripCorrection(correction)
    if (!tripValidation.valid) return { ok: false, reason: tripValidation.reason }
    correctionById.set(correction.id, tripValidation)
  }

  const correctedTrips = existingTrips.map(trip => correctionById.has(trip.id) ? { ...trip, ...correctionById.get(trip.id) } : trip)
  const revenueReconciliation = reconcileShiftRevenue({ shiftRevenue, trips: correctedTrips, toll, parking, tollParkingRevenueTreatment })
  if (revenueReconciliation.reconciliationStatus === 'MISMATCH') return { ok: false, reason: 'SHIFT_REVENUE_TRIP_RECONCILIATION_MISMATCH', reconciliation: revenueReconciliation }
  if (revenueReconciliation.reconciliationStatus === 'UNAVAILABLE' && revenueReconciliation.reason !== 'NO_COMPLETED_TRIPS') return { ok: false, reason: revenueReconciliation.reason, reconciliation: revenueReconciliation }

  try {
    await ShiftTripRepository.completeShift({
      id: shiftId,
      endOdometer: validation.closingOdometer,
      revenue: shiftRevenue,
      toll,
      parking,
      tollParkingRevenueTreatment,
      movementReconciliation,
      revenueReconciliation,
      trips: [...correctionById.entries()].map(([id, correction]) => ({ id, ...correction }))
    })
    return { ok: true, revenue: shiftRevenue }
  } catch (error) {
    return { ok: false, reason: error?.message || 'END_SHIFT_FAILED' }
  }
}
