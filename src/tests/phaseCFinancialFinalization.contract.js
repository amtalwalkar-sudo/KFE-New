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
  breakEvenInputs: [],
}

const noPayment = deriveFinanceAwarePerformance({ ...base, loanPayments: [] }, range)
assert.equal(noPayment.actualLoanPaid, 0)
assert.equal(noPayment.performanceHeadlineActualProfit, noPayment.operatingProfit)
assert.equal(noPayment.performanceHeadlineScheduledEmi, 1000)
assert.equal(noPayment.performanceHeadlineProvisionalProfit, noPayment.operatingProfit - 1000)

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
assert.equal(paidEmi.performanceHeadlineActualProfit, paidEmi.operatingProfit - 1000)
assert.equal(paidEmi.performanceHeadlineProvisionalProfit, paidEmi.operatingProfit - 1000)

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
assert.equal(futurePayment.performanceHeadlineActualProfit, futurePayment.operatingProfit)

console.log('Phase C financial finalization contract: Actual P/L uses actual loan cash payments; Provisional P/L uses scheduled EMI.')
