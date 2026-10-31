export const WORK_TRIP_OPERATORS = Object.freeze(['Uber', 'One way', 'Rapido', 'Ola', 'Savaari'])

export function validateTripOperator(operator) {
  if (!WORK_TRIP_OPERATORS.includes(operator)) {
    return { valid: false, reason: 'Select a valid trip operator.' }
  }
  return { valid: true, operator }
}

export function validateTripDetails(data = {}) {
  const result = {}
  if (data.revenue !== undefined) {
    const revenue = Number(data.revenue)
    if (!Number.isFinite(revenue) || revenue < 0) return { valid: false, reason: 'Trip fare must be a non-negative number.' }
    result.revenue = revenue
  }
  for (const field of ['toll', 'parking']) {
    if (data[field] === undefined || data[field] === '') continue
    const amount = Number(data[field])
    if (!Number.isFinite(amount) || amount < 0) return { valid: false, reason: `Trip ${field} must be a non-negative number.` }
    result[field] = amount
  }
  if (data.fareDetailsSkipped !== undefined) {
    if (typeof data.fareDetailsSkipped !== 'boolean') return { valid: false, reason: 'Fare detail skip state must be boolean.' }
    result.fareDetailsSkipped = data.fareDetailsSkipped
  }
  return { valid: true, ...result }
}
