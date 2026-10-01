import assert from 'node:assert/strict'
import { reconcileShiftRevenue } from '../domain/work/revenueReconciliation.js'
import { validateEndShiftEntry } from '../domain/work/endShift.js'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'

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


const range = { from: new Date('2026-10-01T00:00:00+05:30'), to: new Date('2026-10-31T23:59:59+05:30') }
const performanceSnapshot = {
  shifts: [{ id: 's-included', status: 'COMPLETED', startOdometer: 100, endOdometer: 200, shiftStartAt: '2026-10-01T08:00:00+05:30', shiftEndAt: '2026-10-01T18:00:00+05:30', revenue: 500, toll: 50, parking: 0, tollParkingRevenueTreatment: 'INCLUDED' }],
  trips: [{ id: 't-included', shiftId: 's-included', status: 'COMPLETED', tripEndAt: '2026-10-01T10:00:00+05:30', tripKm: 20, toll: 10, parking: 5 }],
  fuelLogs: [], maintenance: [], compliance: [], breakEvenInputs: [], settlements: [], vehicles: []
}
const includedMetrics = derivePerformance(performanceSnapshot, range)
assert.equal(includedMetrics.financialRevenue, 435)
assert.equal(includedMetrics.toll, 60)
assert.equal(includedMetrics.parking, 5)
assert.equal(includedMetrics.operatingCost, 0)
assert.equal(includedMetrics.operatingProfit, 435)
const excludedMetrics = derivePerformance({
  ...performanceSnapshot,
  shifts: [{ ...performanceSnapshot.shifts[0], tollParkingRevenueTreatment: 'EXCLUDED' }]
}, range)
assert.equal(excludedMetrics.financialRevenue, 500)
assert.equal(excludedMetrics.toll, 60)
assert.equal(excludedMetrics.parking, 5)
assert.equal(excludedMetrics.operatingCost, 65)
assert.equal(excludedMetrics.operatingProfit, 435)

console.log('FAH-2 revenue reconciliation contract passed: shift-end revenue authority, optional trip detail, toll/parking inclusion without double counting, and end-shift revenue validation.')
