const nonNegative = value => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}
export const deriveLiveRevenue = (trips = []) => (Array.isArray(trips) ? trips : [])
  .filter(trip => trip && !trip.deletedAt && trip.deleted !== true)
  .reduce((total, trip) => {
    if (trip.status === 'COMPLETED' && trip.fareDetailsSkipped !== true) return total + (nonNegative(trip.revenue) ?? 0)
    if (trip.status === 'CANCELLED') {
      // Cancellation revenue is only the cancellation fee. Missing, blank, or
      // not-applicable fees are ₹0; never reuse a pre-cancellation trip fare.
      return total + (nonNegative(trip.cancelledRevenue) ?? 0)
    }
    return total
  }, 0)
