import assert from 'node:assert/strict'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'
import { deriveLoanPosition } from '../domain/finance/loanEngine.js'
import { istCalendarDaysInclusive, istDateKey, addIstMonths } from '../domain/time/ist.js'

const ist = value => new Date(value)

// Effective-date records are calendar-day authorities. A record beginning on
// the first IST day of a month must apply to that month even though the month
// boundary is represented internally as a UTC instant.
const targetResult = deriveRollingDriverTarget({
  trips: [
    { id: 'jul-trip', status: 'COMPLETED', tripEndAt: '2026-07-20T10:00:00+05:30', revenue: 500 },
    { id: 'aug-trip', status: 'COMPLETED', tripEndAt: '2026-08-01T10:00:00+05:30', revenue: 200 },
  ],
  shifts: [{ id: 'aug-shift', shiftStartAt: '2026-08-01T08:00:00+05:30', shiftEndAt: '2026-08-01T18:00:00+05:30', startOdometer: 1000, endOdometer: 1100 }],
  driverTargets: [
    { id: 'jul-target', effectiveFrom: '2026-07-01', desiredDriverProfit: 100 },
    { id: 'aug-target', effectiveFrom: '2026-08-01', desiredDriverProfit: 100 },
  ],
  from: ist('2026-08-01T00:00:00+05:30'),
  to: ist('2026-08-01T23:59:59.999+05:30'),
  applicableBreakEven: 1000,
  historicalBreakEvenForDay: () => 900,
})
assert.equal(targetResult.available, true)
assert.equal(targetResult.currentTargetMonth, '2026-08')
assert.equal(targetResult.reason, null)

assert.equal(istDateKey('2026-08-01T00:00:00+05:30'), '2026-08-01')
assert.equal(istDateKey('2026-07-31T18:30:00Z'), '2026-08-01')
assert.equal(istCalendarDaysInclusive('2026-01-01T00:00:00+05:30', '2026-01-31T23:59:59.999+05:30'), 31)
assert.equal(istCalendarDaysInclusive('2028-02-01T00:00:00+05:30', '2028-02-29T23:59:59.999+05:30'), 29)
assert.equal(istCalendarDaysInclusive('2027-02-01T00:00:00+05:30', '2027-02-28T23:59:59.999+05:30'), 28)
assert.equal(istDateKey(addIstMonths(ist('2026-01-01T00:00:00+05:30'), 1)), '2026-02-01')
assert.equal(istDateKey(addIstMonths(ist('2026-01-31T00:00:00+05:30'), 1)), '2026-02-28')

const loanSnapshot = {
  shifts: [], trips: [], fuelLogs: [], maintenance: [], compliance: [], driverTargets: [], breakEvenInputs: [],
  loans: [{ id: 'loan-boundary', principal: 12000, annualInterestRatePercent: 12, tenureMonths: 12, startDate: '2026-01-01T00:00:00+05:30', status: 'ACTIVE' }],
  loanPayments: [], prepayments: [],
}

const january = deriveLoanPosition({ loan: loanSnapshot.loans[0], asOf: ist('2026-01-31T23:59:59.999+05:30') })
assert.equal(january.schedule[0].originalInterestComponent, Math.round((12000 * 0.12 * 31 / 365) * 100) / 100)

const leapLoan = { ...loanSnapshot.loans[0], id: 'leap-loan', startDate: '2028-02-01T00:00:00+05:30' }
const leapFebruary = deriveLoanPosition({ loan: leapLoan, asOf: ist('2028-02-29T23:59:59.999+05:30') })
assert.equal(leapFebruary.schedule[0].originalInterestComponent, Math.round((12000 * 0.12 * 29 / 365) * 100) / 100)

const paymentBoundary = { ...loanSnapshot, prepayments: [{ loanId: 'loan-boundary', paidOn: '2026-02-01T00:00:00+05:30', amount: 1000, status: 'Applied' }] }
const february = deriveLoanPosition({ loan: paymentBoundary.loans[0], prepayments: paymentBoundary.prepayments, asOf: ist('2026-02-28T23:59:59.999+05:30') })
assert.equal(february.actualPrepayment, 1000)

console.log('Boundary regression contract passed: IST effective dates, month arithmetic, full/partial calendar-day loan accrual, leap February, and due-month prepayment boundaries.')
