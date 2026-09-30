const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const money = value => Number.isFinite(Number(value)) ? Number(value) : NaN
const nonNegativeMoney = value => { const n = money(value); return Number.isFinite(n) && n >= 0 ? n : 0 }

export const TOLL_PARKING_TREATMENTS = Object.freeze({
  INCLUDED: 'INCLUDED',
  EXCLUDED: 'EXCLUDED',
})

/**
 * BR-11 financial treatment.
 *
 * shifts.revenue is the authoritative customer-paid total.
 * INCLUDED toll/parking are pass-through amounts already contained in that
 * customer-paid total, so they are removed from Financial Revenue and are not
 * deducted a second time as operating expenses.
 * EXCLUDED toll/parking are paid separately by the driver/business, so the
 * full customer-paid total remains Financial Revenue and the actual toll/
 * parking expense is counted once in operating profit.
 */
export function deriveFinancialRevenue({ customerPaidTotal, toll = 0, parking = 0, tollParkingRevenueTreatment = TOLL_PARKING_TREATMENTS.INCLUDED } = {}) {
  const gross = money(customerPaidTotal)
  if (!Number.isFinite(gross) || gross < 0) return { financialRevenue: null, includedPassThrough: 0, excludedActualExpense: 0, status: 'UNAVAILABLE', reason: 'CUSTOMER_PAID_TOTAL_REQUIRED' }

  const included = tollParkingRevenueTreatment === TOLL_PARKING_TREATMENTS.INCLUDED
  const tollAmount = nonNegativeMoney(toll)
  const parkingAmount = nonNegativeMoney(parking)
  const passThrough = included ? tollAmount + parkingAmount : 0
  const excludedExpense = included ? 0 : tollAmount + parkingAmount
  return {
    financialRevenue: gross - passThrough,
    customerPaidTotal: gross,
    includedPassThrough: passThrough,
    excludedActualExpense: excludedExpense,
    toll: tollAmount,
    parking: parkingAmount,
    tollParkingRevenueTreatment,
    status: 'AVAILABLE',
  }
}

/**
 * Shift-end revenue is the authoritative customer-paid total. Completed-trip
 * fares are optional supporting detail and reconcile against that customer-paid
 * total when complete. Toll/parking treatment is separately exposed for the
 * canonical financial calculation.
 */
export function reconcileShiftRevenue({ shiftRevenue, trips = [], toll = 0, parking = 0, tollParkingRevenueTreatment = TOLL_PARKING_TREATMENTS.INCLUDED } = {}) {
  const authoritativeRevenue = money(shiftRevenue)
  const financial = deriveFinancialRevenue({
    customerPaidTotal: authoritativeRevenue,
    toll,
    parking,
    tollParkingRevenueTreatment,
  })
  const common = {
    authoritativeRevenue: Number.isFinite(authoritativeRevenue) ? authoritativeRevenue : null,
    ...financial,
    completedTrips: 0,
    pricedTrips: 0,
    unpricedTrips: 0,
    toll: nonNegativeMoney(toll),
    parking: nonNegativeMoney(parking),
    tollParkingRevenueTreatment,
  }
  if (!Number.isFinite(authoritativeRevenue) || authoritativeRevenue < 0) {
    return { ...common, reconciliationStatus: 'UNAVAILABLE', reason: 'SHIFT_REVENUE_REQUIRED', tripRevenue: null, difference: null }
  }

  const completed = live(trips).filter(trip => trip?.status === 'COMPLETED')
  if (!completed.length) {
    return { ...common, reconciliationStatus: 'NOT_APPLICABLE', reason: 'NO_COMPLETED_TRIPS', tripRevenue: 0, difference: authoritativeRevenue }
  }

  const priced = completed.filter(trip => trip?.revenue !== null && trip?.revenue !== undefined && trip?.revenue !== '')
  const unpricedTrips = completed.length - priced.length
  const tripRevenue = priced.reduce((sum, trip) => {
    const value = money(trip.revenue)
    return sum + (Number.isFinite(value) && value >= 0 ? value : 0)
  }, 0)
  if (unpricedTrips > 0) {
    return { ...common, reconciliationStatus: 'UNAVAILABLE', reason: 'INCOMPLETE_TRIP_REVENUE_DETAIL', tripRevenue, difference: null, completedTrips: completed.length, pricedTrips: priced.length, unpricedTrips }
  }

  const invalid = priced.find(trip => !Number.isFinite(money(trip.revenue)) || money(trip.revenue) < 0)
  if (invalid) return { ...common, reconciliationStatus: 'UNAVAILABLE', reason: 'INVALID_TRIP_REVENUE_DETAIL', tripRevenue: null, difference: null, completedTrips: completed.length, pricedTrips: priced.length, unpricedTrips: 0 }

  const difference = authoritativeRevenue - tripRevenue
  const reconciled = Math.abs(difference) < 0.005
  return { ...common, reconciliationStatus: reconciled ? 'RECONCILED' : 'MISMATCH', reason: reconciled ? null : 'SHIFT_REVENUE_DOES_NOT_MATCH_TRIP_FARES', tripRevenue, difference, completedTrips: completed.length, pricedTrips: priced.length, unpricedTrips: 0 }
}
