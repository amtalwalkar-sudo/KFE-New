import assert from 'node:assert/strict'
import { calculateRollingFuelCostPerKm } from '../domain/math/fuel.js'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'
import { scheduledEmiAccruedForRange } from '../domain/performance/financePerformanceAdapter.js'

const fuel = calculateRollingFuelCostPerKm([
  { id: 'a0', vehicleId: 'A', capturedAt: '2026-01-01T00:00:00Z', odometer: 0, amount: 100, isFullTank: true },
  { id: 'b0', vehicleId: 'B', capturedAt: '2026-01-02T00:00:00Z', odometer: 0, amount: 100, isFullTank: true },
  { id: 'a1', vehicleId: 'A', capturedAt: '2026-01-03T00:00:00Z', odometer: 100, amount: 100, isFullTank: true },
  { id: 'b1', vehicleId: 'B', capturedAt: '2026-01-04T00:00:00Z', odometer: 100, amount: 300, isFullTank: true },
], 1)
assert.equal(fuel.observations.length, 1)
assert.equal(fuel.observations[0].vehicleId, 'B')
assert.equal(fuel.observations[0].costPerKm, 3, 'Rolling window must select the globally latest chronological interval')

const rolling = deriveRollingDriverTarget({
  trips: [
    { id: 'trip', status: 'COMPLETED', tripEndAt: '2026-09-10T20:00:00.000Z', revenue: 9999 },
  ],
  shifts: [
    { id: 'shift', status: 'COMPLETED', shiftStartAt: '2026-09-10T19:00:00.000Z', shiftEndAt: '2026-09-10T20:00:00.000Z', revenue: 100 },
  ],
  driverTargets: [
    { id: 'target', effectiveFrom: '2026-01-01', effectiveUntil: '2026-12-31', desiredDriverProfit: 0, active: true },
  ],
  from: new Date('2026-09-10T18:30:00.000Z'),
  to: new Date('2026-09-11T18:29:59.999Z'),
  applicableBreakEven: 73000,
})
assert.equal(rolling.activeDays, 1, 'Shift timestamps must be grouped by IST business day, not UTC date')
assert.equal(rolling.authority, 'COMPLETED_SHIFT_REVENUE_AND_SHIFTS_FOR_ACTIVE_DAYS')
assert.equal(rolling.balance, 100, 'Rolling recovery must use the authoritative ₹100 Shift revenue, not the ₹9,999 trip fare')


const octoberRange = {
  from: new Date('2026-10-01T00:00:00+05:30'),
  to: new Date('2026-10-31T23:59:59.999+05:30'),
}
const emiDueNextMonth = [{
  periodStart: '2026-10-01',
  dueDate: '2026-11-01',
  originalEmiAmount: 10000,
  originalInterestComponent: 1800,
}]
assert.equal(
  scheduledEmiAccruedForRange(emiDueNextMonth, octoberRange),
  10000,
  'October management P/L must include the full October EMI obligation even when its cash due date is 1 November',
)
assert.equal(
  scheduledEmiAccruedForRange(emiDueNextMonth, {
    from: new Date('2026-10-10T00:00:00+05:30'),
    to: new Date('2026-10-10T23:59:59.999+05:30'),
  }),
  322.58,
  'Daily P/L must accrue the monthly EMI over the covered calendar period, not wait for the due date',
)
assert.equal(
  scheduledEmiAccruedForRange(emiDueNextMonth, octoberRange, 'originalInterestComponent'),
  1800,
  'Scheduled interest uses the same accrual window as scheduled EMI',
)
assert.equal(
  scheduledEmiAccruedForRange([], octoberRange),
  0,
  'An explicitly empty schedule contributes zero; an unavailable schedule remains distinguishable as null',
)
assert.equal(
  scheduledEmiAccruedForRange(null, octoberRange),
  null,
  'An unavailable schedule must not be fabricated as zero',
)

console.log('Target/break-even authority regression vectors: PASS')
