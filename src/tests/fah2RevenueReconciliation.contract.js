import assert from 'node:assert/strict'
import { reconcileShiftRevenue } from '../domain/work/revenueReconciliation.js'
import { validateEndShiftEntry } from '../domain/work/endShift.js'

const baseTrips = [
  { id: 't1', status: 'COMPLETED', revenue: 700 },
  { id: 't2', status: 'COMPLETED', revenue: 300 },
]

const matched = reconcileShiftRevenue({ shiftRevenue: 1000, trips: baseTrips, toll: 100, parking: 50 })
assert.equal(matched.reconciliationStatus, 'RECONCILED')
assert.equal(matched.authoritativeRevenue, 1000)
assert.equal(matched.tripRevenue, 1000)
assert.equal(matched.difference, 0)
assert.equal(matched.toll, 100)
assert.equal(matched.parking, 50)

const mismatch = reconcileShiftRevenue({ shiftRevenue: 1001, trips: baseTrips })
assert.equal(mismatch.reconciliationStatus, 'MISMATCH')
assert.equal(mismatch.difference, 1)
assert.equal(mismatch.reason, 'SHIFT_REVENUE_DOES_NOT_MATCH_TRIP_FARES')

const incomplete = reconcileShiftRevenue({ shiftRevenue: 1000, trips: [{ id: 't1', status: 'COMPLETED', revenue: 700 }, { id: 't2', status: 'COMPLETED', revenue: null }] })
assert.equal(incomplete.reconciliationStatus, 'UNAVAILABLE')
assert.equal(incomplete.reason, 'INCOMPLETE_TRIP_REVENUE_DETAIL')

const noTrips = reconcileShiftRevenue({ shiftRevenue: 0, trips: [] })
assert.equal(noTrips.reconciliationStatus, 'NOT_APPLICABLE')
assert.equal(noTrips.reason, 'NO_COMPLETED_TRIPS')

const cancelledOnly = reconcileShiftRevenue({ shiftRevenue: 0, trips: [{ id: 't1', status: 'CANCELLED', revenue: 100 }] })
assert.equal(cancelledOnly.reconciliationStatus, 'NOT_APPLICABLE')

const invalidRevenue = reconcileShiftRevenue({ shiftRevenue: 1000, trips: [{ id: 't1', status: 'COMPLETED', revenue: -1 }] })
assert.equal(invalidRevenue.reconciliationStatus, 'UNAVAILABLE')
assert.equal(invalidRevenue.reason, 'INVALID_TRIP_REVENUE_DETAIL')

const validEndShift = validateEndShiftEntry({ closingOdometer: 1200, startOdometer: 1000, revenue: 1000 })
assert.equal(validEndShift.valid, true)
const missingRevenue = validateEndShiftEntry({ closingOdometer: 1200, startOdometer: 1000, revenue: '' })
assert.equal(missingRevenue.valid, false)
assert.equal(missingRevenue.reason, 'SHIFT_REVENUE_REQUIRED')
const negativeRevenue = validateEndShiftEntry({ closingOdometer: 1200, startOdometer: 1000, revenue: -1 })
assert.equal(negativeRevenue.valid, false)
assert.equal(negativeRevenue.reason, 'SHIFT_REVENUE_REQUIRED')

console.log('FAH-2 revenue reconciliation contract passed: shift-end revenue authority, trip-detail reconciliation, incomplete-detail blocking, and end-shift revenue validation.')
