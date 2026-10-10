import assert from 'node:assert/strict'
import { deriveFinanceAwarePerformance } from '../domain/performance/financePerformanceAdapter.js'

const range = {
  from: new Date('2026-09-01T00:00:00+05:30'),
  to: new Date('2026-09-01T23:59:59.999+05:30'),
}

const loan = {
  id: 'phase-c-loan',
  principal: 12000,
  annualInterestRatePercent: 0,
  tenureMonths: 12,
  startDate: '2026-01-01T00:00:00+05:30',
  status: 'ACTIVE',
}

const base = {
  shifts: [{
    id: 'shift-1',
    shiftStartAt: '2026-09-01T08:00:00+05:30',
    shiftEndAt: '2026-09-01T18:00:00+05:30',
    startOdometer: 1000,
    endOdometer: 1100,
    revenue: 5000,
  }],
  trips: [{
    id: 'trip-1',
    shiftId: 'shift-1',
    status: 'COMPLETED',
    tripStartAt: '2026-09-01T09:00:00+05:30',
    tripEndAt: '2026-09-01T10:00:00+05:30',
    tripKm: 80,
    revenue: 5000,
  }],
  fuelLogs: [],
  maintenance: [],
  compliance: [],
  loans: [loan],
  prepayments: [],
  driverTargets: [],
  breakEvenInputs: [{ effectiveFrom: '2026-01-01', maintenanceProvisionPerKm: 0, active: true }],
}

const noPayment = deriveFinanceAwarePerformance({ ...base, loanPayments: [] }, range)
assert.equal(noPayment.actualLoanPaid, 0)
assert.equal(noPayment.performanceHeadlineActualProfit, noPayment.operatingProfit - noPayment.performanceHeadlineScheduledEmi)
assert.ok(Math.abs(noPayment.performanceHeadlineScheduledEmi - (1000 / 30)) < 1e-8, 'Daily P/L accrues the scheduled monthly EMI over calendar days regardless of payment status')
assert.equal(noPayment.performanceHeadlineProvisionalProfit, noPayment.operatingProfit - noPayment.performanceHeadlineScheduledEmi)

const paidEmi = deriveFinanceAwarePerformance({
  ...base,
  loanPayments: [{
    id: 'payment-1',
    loanId: loan.id,
    amount: 1000,
    paidOn: '2026-09-01T12:00:00+05:30',
    status: 'PAID',
  }],
}, range)
assert.equal(paidEmi.actualLoanPaid, 1000)
assert.equal(paidEmi.performanceHeadlineActualProfit, paidEmi.operatingProfit - paidEmi.performanceHeadlineScheduledEmi)
assert.equal(paidEmi.performanceHeadlineScheduledEmi, noPayment.performanceHeadlineScheduledEmi, 'Recording the payment must not change the EMI obligation accrued for the period')
assert.equal(paidEmi.performanceHeadlineProvisionalProfit, paidEmi.operatingProfit - paidEmi.performanceHeadlineScheduledEmi)

const futurePayment = deriveFinanceAwarePerformance({
  ...base,
  loanPayments: [{
    id: 'future-payment',
    loanId: loan.id,
    amount: 1000,
    paidOn: '2026-09-02T12:00:00+05:30',
    status: 'PAID',
  }],
}, range)
assert.equal(futurePayment.actualLoanPaid, 0)
assert.equal(futurePayment.performanceHeadlineActualProfit, futurePayment.operatingProfit - futurePayment.performanceHeadlineScheduledEmi)


const monthRange = {
  from: new Date('2026-09-01T00:00:00+05:30'),
  to: new Date('2026-09-30T23:59:59.999+05:30'),
}
const monthMetrics = deriveFinanceAwarePerformance({ ...base, loanPayments: [] }, monthRange)
assert.ok(Math.abs(monthMetrics.performanceHeadlineScheduledEmi - 1000) < 1e-8, 'Monthly P/L must include the full scheduled EMI obligation even when unpaid')

console.log('Phase C financial finalization contract: P/L accrues scheduled EMI by period independent of payment; actual cash outflow remains separately represented.')
