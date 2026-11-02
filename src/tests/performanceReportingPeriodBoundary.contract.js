import assert from 'node:assert/strict'
import { istDateRange, reportingRangeFor } from '../domain/time/ist.js'
import { derivePhaseOnePerformanceOverview } from '../domain/performance/phaseOneOverview.js'

const metrics = { fuelCost: 0, fuelCostPerKm: null, fuelCostPerKmSource: null }
const shift = {
  id: 'overnight-shift',
  shiftStartAt: '2026-10-25T17:30:00.000Z',
  shiftEndAt: '2026-10-25T19:00:00.000Z',
  revenue: 1500,
}
const snapshot = {
  shifts: [shift],
  trips: [
    { id: 'cross-midnight-completed', shiftId: shift.id, status: 'COMPLETED', tripStartAt: '2026-10-25T18:20:00.000Z', tripEndAt: '2026-10-25T18:40:00.000Z', revenue: 1200 },
    { id: 'cross-midnight-cancelled', shiftId: shift.id, status: 'CANCELLED', tripStartAt: '2026-10-25T18:45:00.000Z', cancelledAt: '2026-10-25T18:50:00.000Z', cancelledRevenue: 300 },
  ],
}

const mondayToday = reportingRangeFor('DAY', new Date('2026-10-25T20:00:00.000Z'))
const mondayOverview = derivePhaseOnePerformanceOverview(snapshot, mondayToday, metrics)
assert.equal(mondayOverview.recordedRevenue, 1500)
assert.equal(mondayOverview.completedRides, 1, 'a ride belongs to the reporting period of its owning shift')
assert.equal(mondayOverview.cancellationFees, 300)
assert.equal(mondayOverview.fareIncome, 1200)
assert.equal(mondayOverview.incomeAfterFuel, 1500)

const sundayToday = reportingRangeFor('DAY', new Date('2026-10-25T17:00:00.000Z'))
const sundayOverview = derivePhaseOnePerformanceOverview(snapshot, sundayToday, metrics)
assert.equal(sundayOverview.recordedRevenue, 0, 'the overnight shift is not split across reporting days')
assert.equal(sundayOverview.completedRides, 0, 'rides are not split away from their shift revenue')
assert.equal(sundayOverview.cancellationFees, 0)

const mondayWeek = reportingRangeFor('WEEK', new Date('2026-10-25T20:00:00.000Z'))
assert.equal(mondayWeek.from.toISOString(), '2026-10-25T18:30:00.000Z', 'IST week starts at Monday 00:00, not UTC Monday')
assert.equal(mondayWeek.to.toISOString(), mondayToday.to.toISOString())

const october = reportingRangeFor('MONTH', new Date('2026-10-25T20:00:00.000Z'))
assert.equal(october.from.toISOString(), '2026-09-30T18:30:00.000Z', 'IST month starts at local midnight')
assert.ok(shift.shiftEndAt >= october.from.toISOString() && shift.shiftEndAt <= october.to.toISOString())

const unlinkedTrip = { status: 'COMPLETED', tripStartAt: '2026-10-25T18:20:00.000Z', tripEndAt: '2026-10-25T18:40:00.000Z' }
const fallback = derivePhaseOnePerformanceOverview({ shifts: [], trips: [unlinkedTrip] }, mondayToday, metrics)
assert.equal(fallback.completedRides, 1, 'legacy/unlinked trips use their event timestamp as a fallback')

const historicalRange = istDateRange('2025-01-04', '2025-02-12')
assert.ok(historicalRange, 'custom date ranges must support historical dates')
assert.equal(historicalRange.from.toISOString(), '2025-01-03T18:30:00.000Z', 'custom start is inclusive from IST midnight')
assert.equal(historicalRange.to.toISOString(), '2025-02-12T18:29:59.999Z', 'custom end is inclusive through IST end of day')
assert.equal(istDateRange('2025-02-12', '2025-01-04'), null, 'reversed custom ranges are rejected')
assert.equal(istDateRange('2025-02-30', '2025-03-01'), null, 'invalid calendar dates are rejected')

const historicalShift = { id: 'before-business-start', shiftEndAt: '2025-01-15T08:00:00.000Z', revenue: 700 }
const historicalOverview = derivePhaseOnePerformanceOverview({ shifts: [historicalShift], trips: [] }, historicalRange, metrics)
assert.equal(historicalOverview.recordedRevenue, 700, 'custom historical periods include saved records regardless of business-start settings')

console.log('Performance reporting-period boundary contract: PASS')
