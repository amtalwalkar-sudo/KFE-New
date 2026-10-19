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
      // Presence of cancelledRevenue is authoritative even when null/blank: do not
      // resurrect a pre-cancellation fare as a cancellation fee.
      const fee = Object.prototype.hasOwnProperty.call(trip, 'cancelledRevenue') ? trip.cancelledRevenue : trip.revenue
      return total + (nonNegative(fee) ?? 0)
    }
    return total
  }, 0)
