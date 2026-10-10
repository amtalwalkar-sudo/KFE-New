import assert from 'node:assert/strict'
import { calculateRollingFuelCostPerKm } from '../domain/math/fuel.js'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'
import { deriveAuthoritativeBreakEven } from '../domain/performance/authoritativeBreakEven.js'
import { deriveAuthoritativeDriverTarget } from '../domain/performance/driverTarget.js'
import { scheduledEmiAccruedForRange, scheduledObligationForRange } from '../domain/performance/financePerformanceAdapter.js'

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
assert.equal(rolling.balance, 2333.3333333333335, 'Rolling recovery must use the calendar-month daily target and authoritative ₹100 Shift revenue, not the ₹9,999 trip fare')


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
  scheduledObligationForRange(emiDueNextMonth, octoberRange),
  10000,
  'October management P/L must include the full October EMI obligation even when its cash due date is 1 November',
)
assert.equal(
  scheduledObligationForRange(emiDueNextMonth, {
    from: new Date('2026-10-01T00:00:00+05:30'),
    to: new Date('2026-10-01T23:59:59.999+05:30'),
  }),
  10000,
  'The full monthly obligation belongs to the schedule period start, not its later due date',
)
assert.equal(
  scheduledObligationForRange(emiDueNextMonth, {
    from: new Date('2026-10-10T00:00:00+05:30'),
    to: new Date('2026-10-10T23:59:59.999+05:30'),
  }),
  0,
  'The monthly EMI must not be charged again on every day within its coverage period',
)
assert.equal(
  scheduledObligationForRange(emiDueNextMonth, octoberRange, 'originalInterestComponent'),
  1800,
  'Scheduled interest uses the same monthly obligation assignment',
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



const octoberTargetRecord = [{
  id: 'october-target',
  effectiveFrom: '2026-10-01',
  effectiveUntil: '2026-10-10',
  desiredDriverProfit: 15000,
  active: true,
}]
const octoberTarget = deriveRollingDriverTarget({
  shifts: [{ id: 'oct-10', status: 'COMPLETED', shiftStartAt: '2026-10-10T03:00:00Z', shiftEndAt: '2026-10-10T12:00:00Z', revenue: 0 }],
  driverTargets: octoberTargetRecord,
  from: new Date('2026-10-10T00:00:00+05:30'),
  to: new Date('2026-10-10T23:59:59.999+05:30'),
  applicableBreakEven: 4672,
})
assert.equal(octoberTarget.activeDays, 1)
assert.ok(Math.abs(octoberTarget.currentBaseDaily - (19672 / 31)) < 1e-10, 'October daily target must use all 31 calendar days, not the 10-day effective record span')

const octoberAuthoritativeTarget = deriveAuthoritativeDriverTarget({
  monthlyBreakEvenRevenue: 4672,
  desiredDriverProfitMonthly: 15000,
  calendarDays: 31,
})
assert.equal(octoberAuthoritativeTarget.monthlyTarget, 19672)
assert.ok(Math.abs(octoberAuthoritativeTarget.target - (19672 / 31)) < 1e-10, 'Authoritative target divides monthly break-even plus desired profit by calendar days in October')

const breakEvenWithUnpaidObligations = deriveAuthoritativeBreakEven({
  breakEvenInputs: [{ effectiveFrom: '2026-10-01', maintenanceProvisionPerKm: 3, active: true }],
  range: octoberRange,
  loanScheduledObligation: 10000,
  loanInputAvailable: true,
  preBusinessRecovery: 0,
  historicalMaintenanceRecovery: 0,
  renewalProvision: 1000,
  complianceInputAvailable: true,
  fuelCostPerKm: 0,
  fuelCostPerKmStatus: 'AUTHORITATIVE',
  vehicleKm: 100,
  vehicleKmSource: 'CONTRACT_TEST',
})
assert.equal(breakEvenWithUnpaidObligations.status, 'AUTHORITATIVE')
assert.equal(breakEvenWithUnpaidObligations.monthlyBreakEvenRevenue, 11300, 'Break-even includes scheduled EMI and maintenance/compliance provisions regardless of payment status')

console.log('Target/break-even authority regression vectors: PASS')
