import { deriveLiveRevenue } from './liveRevenue.js'
const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const money = value => Number.isFinite(Number(value)) ? Number(value) : NaN
const nonNegativeMoney = value => { const n = money(value); return Number.isFinite(n) && n >= 0 ? n : 0 }

export const TOLL_PARKING_TREATMENTS = Object.freeze({
  INCLUDED: 'INCLUDED',
  EXCLUDED: 'EXCLUDED',
})

const validTreatment = value => {
  const normalized = String(value || '').toUpperCase()
  return normalized === TOLL_PARKING_TREATMENTS.INCLUDED || normalized === TOLL_PARKING_TREATMENTS.EXCLUDED
    ? normalized
    : null
}
const resolveTreatment = (specific, legacy) =>
  validTreatment(specific) || validTreatment(legacy) || TOLL_PARKING_TREATMENTS.INCLUDED

/**
 * Sum actual toll/parking records by category and Included/Excluded treatment.
 * ADDITIONAL_ONLY shifts add their shift-level additional amounts to trip records.
 * Legacy aggregate shifts use the greater of the old shift total and trip detail
 * to avoid double counting; missing independent treatment fields use the old
 * shared shift treatment.
 */
export function deriveTollParkingExpenseTreatment({
  trips = [], toll = 0, parking = 0,
  tollTreatment, parkingTreatment,
  tollParkingRevenueTreatment = TOLL_PARKING_TREATMENTS.INCLUDED,
  tollParkingCaptureMode = 'LEGACY_AGGREGATE',
} = {}) {
  const totals = {
    toll: 0,
    parking: 0,
    includedToll: 0,
    includedParking: 0,
    excludedTollExpense: 0,
    excludedParkingExpense: 0,
  }
  const add = (category, amount, treatment) => {
    const value = nonNegativeMoney(amount)
    const included = treatment === TOLL_PARKING_TREATMENTS.INCLUDED
    if (category === 'toll') {
      totals.toll += value
      if (included) totals.includedToll += value
      else totals.excludedTollExpense += value
    } else {
      totals.parking += value
      if (included) totals.includedParking += value
      else totals.excludedParkingExpense += value
    }
  }
  const completedTrips = live(trips).filter(item => item?.status === 'COMPLETED')
  const mode = String(tollParkingCaptureMode || 'LEGACY_AGGREGATE').toUpperCase()

  if (mode === 'ADDITIONAL_ONLY') {
    // Current Work captures only additional shift-level amounts, so sum those
    // with independently treated trip expenses.
    add('toll', toll, resolveTreatment(tollTreatment, tollParkingRevenueTreatment))
    add('parking', parking, resolveTreatment(parkingTreatment, tollParkingRevenueTreatment))
    for (const trip of completedTrips) {
      const legacy = trip.tollParkingRevenueTreatment || tollParkingRevenueTreatment
      add('toll', trip.toll, resolveTreatment(trip.tollTreatment, legacy))
      add('parking', trip.parking, resolveTreatment(trip.parkingTreatment, legacy))
    }
  } else {
    // Historical Shift.toll/parking may already aggregate the trip amounts.
    // Preserve those legacy totals without adding the same trip records again.
    const tripToll = completedTrips.reduce((sum, trip) => sum + nonNegativeMoney(trip.toll), 0)
    const tripParking = completedTrips.reduce((sum, trip) => sum + nonNegativeMoney(trip.parking), 0)
    add('toll', Math.max(nonNegativeMoney(toll), tripToll), resolveTreatment(tollTreatment, tollParkingRevenueTreatment))
    add('parking', Math.max(nonNegativeMoney(parking), tripParking), resolveTreatment(parkingTreatment, tollParkingRevenueTreatment))
  }
  return {
    ...totals,
    includedPassThrough: totals.includedToll + totals.includedParking,
    excludedActualExpense: totals.excludedTollExpense + totals.excludedParkingExpense,
    tollTreatment: resolveTreatment(tollTreatment, tollParkingRevenueTreatment),
    parkingTreatment: resolveTreatment(parkingTreatment, tollParkingRevenueTreatment),
    tollParkingRevenueTreatment,
    tollParkingCaptureMode: mode,
  }
}

/**
 * BR-11 financial treatment. Shift.revenue is the authoritative customer-paid
 * total. Included toll/parking are subtracted from financial revenue and are
 * not deducted a second time as operating costs. Excluded expenses remain
 * actual operating expenses and are counted once.
 */
export function deriveFinancialRevenue({
  customerPaidTotal, toll = 0, parking = 0, trips = [],
  tollTreatment, parkingTreatment, tollParkingCaptureMode,
  tollParkingRevenueTreatment = TOLL_PARKING_TREATMENTS.INCLUDED,
} = {}) {
  const gross = money(customerPaidTotal)
  const expenses = deriveTollParkingExpenseTreatment({
    trips, toll, parking, tollTreatment, parkingTreatment, tollParkingCaptureMode, tollParkingRevenueTreatment,
  })
  if (!Number.isFinite(gross) || gross < 0) {
    return {
      financialRevenue: null, ...expenses, status: 'UNAVAILABLE',
      reason: 'CUSTOMER_PAID_TOTAL_REQUIRED',
    }
  }
  return {
    financialRevenue: gross - expenses.includedPassThrough,
    customerPaidTotal: gross,
    ...expenses,
    status: 'AVAILABLE',
  }
}

/**
 * Reconcile the persisted Shift projection against the canonical rule:
 * eligible completed fares plus cancellation fees, excluding deleted records.
 * A skipped/missing fare contributes zero and does not gate shift closure.
 */
export function reconcileShiftRevenue({
  shiftRevenue, trips = [], toll = 0, parking = 0,
  tollTreatment, parkingTreatment, tollParkingCaptureMode,
  tollParkingRevenueTreatment = TOLL_PARKING_TREATMENTS.INCLUDED,
} = {}) {
  const hasPersistedShiftRevenue = shiftRevenue !== null && shiftRevenue !== undefined && shiftRevenue !== ''
  const authoritativeRevenue = hasPersistedShiftRevenue ? money(shiftRevenue) : NaN
  const eligibleTrips = live(trips)
  const tripRevenue = deriveLiveRevenue(eligibleTrips)
  const financial = deriveFinancialRevenue({
    customerPaidTotal: authoritativeRevenue, trips: eligibleTrips, toll, parking,
    tollTreatment, parkingTreatment, tollParkingCaptureMode, tollParkingRevenueTreatment,
  })
  const completed = eligibleTrips.filter(trip => trip?.status === 'COMPLETED')
  const priced = completed.filter(trip => trip.fareDetailsSkipped !== true && trip.revenue !== null && trip.revenue !== undefined && trip.revenue !== '')
  const unpriced = completed.filter(trip => trip.fareDetailsSkipped !== true && (trip.revenue === null || trip.revenue === undefined || trip.revenue === ''))
  const common = {
    authoritativeRevenue: Number.isFinite(authoritativeRevenue) ? authoritativeRevenue : null,
    ...financial,
    completedTrips: completed.length,
    pricedTrips: priced.length,
    unpricedTrips: unpriced.length,
    tripRevenue,
    additionalToll: nonNegativeMoney(toll),
    additionalParking: nonNegativeMoney(parking),
    tollParkingCaptureMode: financial.tollParkingCaptureMode,
  }
  if (!Number.isFinite(authoritativeRevenue) || authoritativeRevenue < 0) {
    return { ...common, reconciliationStatus: 'UNAVAILABLE', reason: 'SHIFT_REVENUE_REQUIRED', tripRevenue: null, difference: null }
  }
  const invalid = priced.find(trip => !Number.isFinite(money(trip.revenue)) || money(trip.revenue) < 0)
  if (invalid) return { ...common, reconciliationStatus: 'UNAVAILABLE', reason: 'INVALID_TRIP_REVENUE_DETAIL', tripRevenue: null, difference: null }
  // Missing fare details remain visible through unpricedTrips; their revenue contribution is zero.
  if (eligibleTrips.length === 0 && authoritativeRevenue === 0) {
    return { ...common, reconciliationStatus: 'NOT_APPLICABLE', reason: 'NO_ELIGIBLE_TRIP_REVENUE', difference: 0 }
  }
  const difference = authoritativeRevenue - tripRevenue
  const reconciled = Math.abs(difference) < 0.005
  return {
    ...common,
    reconciliationStatus: reconciled ? 'RECONCILED' : 'MISMATCH',
    reason: reconciled ? null : 'SHIFT_REVENUE_DOES_NOT_MATCH_ELIGIBLE_TRIP_REVENUE',
    difference,
  }
}
