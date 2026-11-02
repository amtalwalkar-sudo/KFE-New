const LARGE_DISTANCE_WARNING_KM = 500
const blank = value => value == null || (typeof value === 'string' && value.trim() === '')

export function validateEndShiftEntry({ closingOdometer, startOdometer, confirmLargeDistance = false }) {
  const start = blank(startOdometer) ? 0 : Number(startOdometer)
  const closing = blank(closingOdometer) ? Number.NaN : Number(closingOdometer)
  if (!Number.isFinite(closing) || closing < 0) {
    return { valid: false, reason: 'CLOSING_ODOMETER_REQUIRED' }
  }
  if (!Number.isFinite(start) || closing < start) {
    return { valid: false, reason: 'Closing odometer cannot be lower than the shift opening odometer.' }
  }
  const distanceKm = closing - start
  if (distanceKm > LARGE_DISTANCE_WARNING_KM && confirmLargeDistance !== true) {
    return {
      valid: false,
      reason: `Closing odometer is ${distanceKm} km above shift opening. Confirm this unusually high daily distance before ending the Shift.`,
      distanceKm,
      requiresConfirmation: true,
    }
  }
  return { valid: true, closingOdometer: closing, distanceKm }
}

export { LARGE_DISTANCE_WARNING_KM }
