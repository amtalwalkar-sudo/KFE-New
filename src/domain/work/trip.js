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
  if (data.revenue !== undefined) {
    if (data.revenue === '' || data.revenue === null) {
      // Explicitly clearing a previously saved fare is different from omitting
      // the field: persist null so reconciliation reports it as unpriced.
      result.revenue = null
    } else {
      const revenue = Number(data.revenue)
      if (!Number.isFinite(revenue) || revenue < 0) return { valid: false, reason: 'Trip revenue must be a non-negative number.' }
      result.revenue = revenue
    }
  }
  for (const field of ['toll', 'parking']) {
    if (data[field] === undefined || data[field] === '') continue
    const amount = Number(data[field])
    if (!Number.isFinite(amount) || amount < 0) return { valid: false, reason: `Trip ${field} must be a non-negative number.` }
    result[field] = amount
  }
  if (data.cancelReason !== undefined) {
    const cancelReason = String(data.cancelReason || '').trim()
    if (!cancelReason) return { valid: false, reason: 'Cancellation reason is required.' }
    result.cancelReason = cancelReason
  }
  if (data.fareDetailsSkipped !== undefined) {
    if (typeof data.fareDetailsSkipped !== 'boolean') return { valid: false, reason: 'Fare detail skip state must be boolean.' }
    result.fareDetailsSkipped = data.fareDetailsSkipped
  }
  return { valid: true, ...result }
}

