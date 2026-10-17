import { validateEndShiftEntry } from '../../domain/work/endShift.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'

export async function completeEndShift({ shiftId, closingOdometer, confirmLargeDistance = false, movementReconciliation = null }) {
  const active = await ShiftTripRepository.getActive()
  if (!active.shift || active.shift.id !== shiftId) return { ok: false, reason: 'Active shift not found.' }
  if (active.trip) return { ok: false, reason: 'ACTIVE_TRIP_IN_PROGRESS' }

  const validation = validateEndShiftEntry({
    closingOdometer,
    startOdometer: active.shift.startOdometer,
    confirmLargeDistance
  })
  if (!validation.valid) return {
    ok: false,
    reason: validation.reason,
    requiresConfirmation: validation.requiresConfirmation,
    distanceKm: validation.distanceKm
  }

  try {
    await ShiftTripRepository.completeShift({
      id: shiftId,
      endOdometer: validation.closingOdometer,
      movementReconciliation
    })
    return { ok: true, endOdometer: validation.closingOdometer, distanceKm: validation.distanceKm }
  } catch (error) {
    return { ok: false, reason: error?.message || 'END_SHIFT_FAILED' }
  }
}
