const numeric = value => value == null || (typeof value === 'string' && value.trim() === '') ? Number.NaN : Number(value)

export function validateShiftStartOdometer(currentOdometer, previousOdometer = null) {
  const current = numeric(currentOdometer)
  if (!Number.isFinite(current) || current <= 0) {
    return { valid: false, reason: 'Enter a valid current odometer.' }
  }
  const previous = numeric(previousOdometer)
  if (Number.isFinite(previous) && current < previous) {
    return { valid: false, reason: 'Current odometer cannot be lower than the last recorded odometer.' }
  }
  return { valid: true }
}

export function validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer = null) {
  const current = numeric(currentOdometer)
  if (!Number.isFinite(current) || current <= 0) {
    return { valid: false, reason: 'Enter a valid current odometer.' }
  }
  const baseline = numeric(businessStartOdometer)
  if (Number.isFinite(baseline) && current < baseline) {
    return { valid: false, reason: 'Current odometer cannot be lower than the business start odometer.' }
  }
  return { valid: true }
}
