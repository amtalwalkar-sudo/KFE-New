/**
 * Canonical shift-revenue projection shared by PWA repositories and parity tests.
 * Only non-deleted completed fares and cancellation fees are eligible; skipped
 * fare detail and blank/not-applicable cancellation fees contribute zero.
 */
const nonNegative = value => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}
export const deriveLiveRevenue = (trips = []) => (Array.isArray(trips) ? trips : [])
  .filter(trip => trip && !trip.deletedAt && trip.deleted !== true)
  .reduce((total, trip) => {
    if (trip.status === 'COMPLETED' && trip.fareDetailsSkipped !== true) return total + (nonNegative(trip.revenue) ?? 0)
    if (trip.status === 'CANCELLED') return total + (nonNegative(trip.cancelledRevenue ?? trip.revenue) ?? 0)
    return total
  }, 0)
