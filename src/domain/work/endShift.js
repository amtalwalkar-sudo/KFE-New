const LARGE_DISTANCE_WARNING_KM = 500

export function validateEndShiftEntry({ closingOdometer, startOdometer, confirmLargeDistance = false }) {
  const odometer = Number(closingOdometer)
  const start = Number(startOdometer)

  if (!Number.isFinite(odometer) || odometer < 0) {
    return { valid: false, reason: 'CLOSING_ODOMETER_REQUIRED' }
  }

  if (Number.isFinite(start) && odometer < start) {
    return { valid: false, reason: 'Closing odometer cannot be lower than the shift opening odometer.' }
  }

  const distance = Number.isFinite(start) ? odometer - start : null
  if (distance != null && distance > LARGE_DISTANCE_WARNING_KM && !confirmLargeDistance) {
    return {
      valid: false,
      requiresConfirmation: true,
      distanceKm: distance,
      reason: `Closing odometer is ${distance} km above shift opening. Confirm this unusually high daily distance before ending the Shift.`
    }
  }

  return { valid: true, closingOdometer: odometer, distanceKm: distance }
}

export { LARGE_DISTANCE_WARNING_KM }
