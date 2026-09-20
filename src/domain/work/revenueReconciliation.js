const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const money = value => Number.isFinite(Number(value)) ? Number(value) : NaN

/**
 * Shift-end revenue is the authoritative revenue fact. Completed-trip fares are
 * supporting detail and must reconcile to that fact when they are present.
 * Toll/parking remain operating-cost facts and are intentionally not added to revenue.
 */
export function reconcileShiftRevenue({ shiftRevenue, trips = [], toll = 0, parking = 0, tollParkingRevenueTreatment = 'INCLUDED' } = {}) {
  const authoritativeRevenue = money(shiftRevenue)
  if (!Number.isFinite(authoritativeRevenue) || authoritativeRevenue < 0) {
    return { reconciliationStatus: 'UNAVAILABLE', reason: 'SHIFT_REVENUE_REQUIRED', authoritativeRevenue: null, tripRevenue: null, difference: null, completedTrips: 0, pricedTrips: 0, unpricedTrips: 0, toll: money(toll) || 0, parking: money(parking) || 0, tollParkingRevenueTreatment }
  }
  const completed = live(trips).filter(trip => trip?.status === 'COMPLETED')
  if (!completed.length) {
    return { reconciliationStatus: 'NOT_APPLICABLE', reason: 'NO_COMPLETED_TRIPS', authoritativeRevenue, tripRevenue: 0, difference: authoritativeRevenue, completedTrips: 0, pricedTrips: 0, unpricedTrips: 0, toll: money(toll) || 0, parking: money(parking) || 0, tollParkingRevenueTreatment }
  }
  const priced = completed.filter(trip => trip?.revenue !== null && trip?.revenue !== undefined && trip?.revenue !== '')
  const unpricedTrips = completed.length - priced.length
  if (unpricedTrips > 0) {
    return { reconciliationStatus: 'UNAVAILABLE', reason: 'INCOMPLETE_TRIP_REVENUE_DETAIL', authoritativeRevenue, tripRevenue: priced.reduce((sum, trip) => sum + (money(trip.revenue) >= 0 ? money(trip.revenue) : 0), 0), difference: null, completedTrips: completed.length, pricedTrips: priced.length, unpricedTrips, toll: money(toll) || 0, parking: money(parking) || 0, tollParkingRevenueTreatment }
  }
  const invalid = priced.find(trip => !Number.isFinite(money(trip.revenue)) || money(trip.revenue) < 0)
  if (invalid) return { reconciliationStatus: 'UNAVAILABLE', reason: 'INVALID_TRIP_REVENUE_DETAIL', authoritativeRevenue, tripRevenue: null, difference: null, completedTrips: completed.length, pricedTrips: priced.length, unpricedTrips: 0, toll: money(toll) || 0, parking: money(parking) || 0, tollParkingRevenueTreatment }
  const tripRevenue = priced.reduce((sum, trip) => sum + money(trip.revenue), 0)
  const difference = authoritativeRevenue - tripRevenue
  const reconciled = Math.abs(difference) < 0.005
  return { reconciliationStatus: reconciled ? 'RECONCILED' : 'MISMATCH', reason: reconciled ? null : 'SHIFT_REVENUE_DOES_NOT_MATCH_TRIP_FARES', authoritativeRevenue, tripRevenue, difference, completedTrips: completed.length, pricedTrips: priced.length, unpricedTrips: 0, toll: money(toll) || 0, parking: money(parking) || 0, tollParkingRevenueTreatment }
}
