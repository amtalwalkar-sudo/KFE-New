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
 * Shift-end revenue is authoritative customer-paid total. Completed-trip fares
 * are optional supporting detail; trip toll/parking treatment is independently
 * reflected in the financial revenue preview without becoming a second revenue
 * authority.
 */
export function reconcileShiftRevenue({
  shiftRevenue, trips = [], toll = 0, parking = 0,
  tollTreatment, parkingTreatment, tollParkingCaptureMode,
  tollParkingRevenueTreatment = TOLL_PARKING_TREATMENTS.INCLUDED,
} = {}) {
  const authoritativeRevenue = money(shiftRevenue)
  const financial = deriveFinancialRevenue({
    customerPaidTotal: authoritativeRevenue, trips, toll, parking,
    tollTreatment, parkingTreatment, tollParkingCaptureMode, tollParkingRevenueTreatment,
  })
  const common = {
    authoritativeRevenue: Number.isFinite(authoritativeRevenue) ? authoritativeRevenue : null,
    ...financial,
    completedTrips: 0,
    pricedTrips: 0,
    unpricedTrips: 0,
    additionalToll: nonNegativeMoney(toll),
    additionalParking: nonNegativeMoney(parking),
    tollParkingCaptureMode: financial.tollParkingCaptureMode,
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
