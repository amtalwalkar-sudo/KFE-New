const MAX_SHIFT_KM = 1000
const MAX_REVENUE_PER_ENTRY = 5000

export const ShiftValidator = {
  MAX_SHIFT_KM,
  MAX_REVENUE_PER_ENTRY,

  validateSubmission({ startOdometer, endOdometer, revenue }) {
    const start = Number(startOdometer)
    const end = Number(endOdometer)
    const rev = Number(revenue)
    const errors = []

    if (!Number.isFinite(start) || start <= 0) {
      errors.push('Please enter a valid positive Start Odometer reading.')
    }

    if (!Number.isFinite(end) || !Number.isFinite(start) || end <= start) {
      errors.push('End Odometer must be strictly greater than Start Odometer.')
    }

    const distance = Number.isFinite(start) && Number.isFinite(end) ? end - start : NaN
    if (Number.isFinite(distance) && distance > MAX_SHIFT_KM) {
      errors.push(`Shift distance (${distance} km) exceeds maximum limit of ${MAX_SHIFT_KM} km per shift. Please check input.`)
    }

    if (!Number.isFinite(rev) || rev < 0 || rev > MAX_REVENUE_PER_ENTRY) {
      errors.push('Please enter a valid revenue between ₹0 and ₹5,000.')
    }

    return {
      valid: errors.length === 0,
      errors,
      values: {
        startOdometer: start,
        endOdometer: end,
        revenue: rev,
        totalDistance: distance
      }
    }
  }
}
