export const WORK_TRIP_OPERATORS = Object.freeze(['Uber', 'One way', 'Rapido', 'Ola', 'Savaari'])

export function validateTripOperator(operator) {
  if (!WORK_TRIP_OPERATORS.includes(operator)) {
    return { valid: false, reason: 'Select a valid trip operator.' }
  }
  return { valid: true, operator }
}

export function validateTripCorrection(data = {}) {
  const result = {}
  if (data.operator !== undefined) {
    const operator = validateTripOperator(data.operator)
    if (!operator.valid) return operator
    result.operator = operator.operator
  }
  if (data.tripKm !== undefined && data.tripKm !== '') {
    const tripKm = Number(data.tripKm)
    if (!Number.isFinite(tripKm) || tripKm < 0) return { valid: false, reason: 'Trip KM must be a non-negative number.' }
    result.tripKm = tripKm
  }
  if (data.revenue !== undefined && data.revenue !== '') {
    const revenue = Number(data.revenue)
    if (!Number.isFinite(revenue) || revenue < 0) return { valid: false, reason: 'Trip revenue must be a non-negative number.' }
    result.revenue = revenue
  }
  if (data.cancelReason !== undefined) {
    const cancelReason = String(data.cancelReason || '').trim()
    if (!cancelReason) return { valid: false, reason: 'Cancellation reason is required.' }
    result.cancelReason = cancelReason
  }
  return { valid: true, ...result }
}

export function calculateShiftRevenue(trips = []) {
  return trips
    .filter(trip => trip?.status === 'COMPLETED')
    .reduce((total, trip) => {
      const revenue = Number(trip?.revenue)
      return total + (Number.isFinite(revenue) && revenue >= 0 ? revenue : 0)
    }, 0)
}
