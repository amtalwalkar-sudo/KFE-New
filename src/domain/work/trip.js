import { normalizeTripInput } from '../canonicalNormalization.js'

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

/**
 * Apply validated fare/detail facts to an existing completed Trip.
 * Shared by browser repository writes and the native-first Work application path.
 * Shift revenue is projected separately from canonical Trip facts.
 */
export function applyTripDetails(trip, data, now) {
  if (!trip?.id || trip.status !== 'COMPLETED') throw new Error('Trip details can only be saved after a completed ride.')
  const normalized = normalizeTripInput(data)
  const next = { ...trip }
  if (normalized.revenue !== undefined) next.revenue = normalized.revenue
  for (const field of ['toll', 'parking', 'fareDetailsSkipped']) {
    if (normalized[field] !== undefined) next[field] = normalized[field]
  }
  // Retire the old per-Trip revenue authority marker. Shift.revenue is the
  // sole shift-level projection; Trip fare is a supporting source fact.
  delete next.revenueAuthority
  next.updatedAt = now
  return next
}
