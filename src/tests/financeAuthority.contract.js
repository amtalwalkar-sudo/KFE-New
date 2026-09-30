import assert from 'node:assert/strict'
import { calculateEmi, deriveLoanPosition, paymentAllocationPreview, calculatePrepaymentEstimate, calculatePreBusinessRecovery } from '../domain/finance/loanEngine.js'

const loan = { id: 'loan-1', principal: 12000, tenureMonths: 12, startDate: '2026-01-01T00:00:00+05:30', annualInterestRatePercent: 10, status: 'Active' }
const emi = calculateEmi(loan.principal, loan.tenureMonths, loan.annualInterestRatePercent)
assert.ok(emi > 1000 && emi < 1100)

const empty = deriveLoanPosition({ loan, asOf: '2026-03-15T00:00:00+05:30' })
assert.equal(empty.annualInterestRatePercent, 10)
assert.ok(empty.schedule.length >= 12)
assert.ok(empty.totalOverdue > 0)

// Frozen allocation order: oldest EMI -> overdue interest -> scheduled interest -> principal.
const allocationExample = paymentAllocationPreview({
  loan,
  payments: [],
  prepayments: [],
  amount: 100,
  paidOn: '2026-02-15T00:00:00+05:30',
})
assert.equal(allocationExample.available, true)
assert.equal(allocationExample.allocations[0].obligationId, 'loan-1:emi:1')
assert.ok(allocationExample.allocations[0].overdueInterest >= 0)
assert.equal(allocationExample.allocations[0].scheduledPrincipal, 0)

// A payment on the EMI due date has zero overdue days and therefore zero additional overdue interest.
const dueDateAllocation = paymentAllocationPreview({
  loan,
  payments: [],
  prepayments: [],
  amount: emi,
  paidOn: '2026-02-01T00:00:00+05:30',
})
assert.equal(dueDateAllocation.available, true)
assert.equal(dueDateAllocation.allocations[0].overdueInterest, 0)
assert.ok(dueDateAllocation.allocations[0].scheduledInterest > 0)
assert.ok(dueDateAllocation.allocations[0].scheduledPrincipal > 0)

// Partial payment never reduces principal while the EMI's interest obligations remain unpaid.
const partiallyPaid = deriveLoanPosition({
  loan,
  payments: [{ id: 'payment-1', loanId: 'loan-1', amount: 100, paidOn: '2026-02-15T00:00:00+05:30', status: 'PAID' }],
  prepayments: [],
  asOf: '2026-02-20T00:00:00+05:30',
})
assert.ok(partiallyPaid.totalOverdue > 0)
assert.equal(partiallyPaid.schedule[0].scheduledPrincipalPaid, 0)
assert.ok(partiallyPaid.schedule[0].overdueInterestPaid > 0)
assert.ok(partiallyPaid.schedule[0].scheduledInterestPaid > 0)
assert.ok(partiallyPaid.schedule[0].scheduledInterestPaid < 100)

// Chronology: a payment allocated to the oldest unpaid EMI cannot jump to a later EMI.
const chronological = paymentAllocationPreview({
  loan,
  payments: [],
  prepayments: [],
  amount: emi,
  paidOn: '2026-03-15T00:00:00+05:30',
})
assert.equal(chronological.available, true)
assert.equal(chronological.allocations[0].obligationId, 'loan-1:emi:1')
assert.ok(chronological.allocations.every(allocation => allocation.obligationId === 'loan-1:emi:1'))

const blockedPrepayment = calculatePrepaymentEstimate({
  loan,
  payments: [],
  prepayments: [],
  amount: 1000,
  paidOn: '2026-03-15T00:00:00+05:30',
})
assert.equal(blockedPrepayment.available, false)
assert.equal(blockedPrepayment.reason, 'OVERDUE_EMI_MUST_BE_SETTLED_FIRST')

const settledPrepayment = calculatePrepaymentEstimate({
  loan,
  payments: [
    { id: 'p1', loanId: 'loan-1', amount: emi, paidOn: '2026-02-01T00:00:00+05:30', status: 'PAID' },
    { id: 'p2', loanId: 'loan-1', amount: emi, paidOn: '2026-03-01T00:00:00+05:30', status: 'PAID' },
  ],
  prepayments: [],
  amount: 1000,
  paidOn: '2026-03-02T00:00:00+05:30',
})
assert.equal(settledPrepayment.available, true)
assert.equal(settledPrepayment.prepaymentCharge, 0)
assert.equal(settledPrepayment.effect, 'REDUCE_TENURE_KEEP_EMI')

const recovery = calculatePreBusinessRecovery({
  position: deriveLoanPosition({ loan, payments: [], prepayments: [], asOf: '2026-03-15T00:00:00+05:30' }),
  businessStartDate: '2026-03-10T00:00:00+05:30',
  asOf: '2026-03-15T00:00:00+05:30',
})
assert.ok(recovery > 0)
assert.equal(recovery, Math.round((empty.overdue[0].overdueAmount + empty.overdue[1].overdueAmount) / 12 * 100) / 100)

console.log('Finance authority contract passed: explicit loan rate, chronological payment allocation, zero overdue interest on due date, overdue interest, prepayment gating, tenure reduction and pre-business 12-month normalization.')
