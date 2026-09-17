import assert from 'node:assert/strict'
import { ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import {
  calculateEmi,
  deriveLoanPosition,
  paymentAllocationPreview,
  calculatePrepaymentEstimate,
} from '../domain/finance/loanEngine.js'

const loan = {
  id: 'loan-e2e',
  principal: 550000,
  tenureMonths: 60,
  startDate: '2026-01-01',
  status: 'Active',
}

const emi = calculateEmi(loan.principal, loan.tenureMonths)
assert.ok(emi > 0, 'EMI must be calculated from loan source inputs')
assert.equal(ADMIN_FORM_DEFINITIONS.loan.fields.some(field => field.key === 'emi'), false, 'EMI must not be a user-entered loan source field')
assert.equal(ADMIN_FORM_DEFINITIONS.loan.fields.some(field => field.key === 'annual_rate_percent'), false, 'Interest rate must not be a user-entered loan source field')
assert.equal(ADMIN_FORM_DEFINITIONS.loanPayment.calculationRole, 'authoritative-payment-record')
assert.equal(ADMIN_FORM_DEFINITIONS.prepayment.calculationRole, 'authoritative-prepayment-record')

const due = '2026-02-01'
const late = '2026-02-11'
const later = '2026-04-01'

// Full payment: one actual EMI settles the scheduled obligation on time.
{
  const position = deriveLoanPosition({ loan, payments: [{ id: 'p1', loanId: loan.id, amount: emi, paidOn: due, status: 'PAID' }], asOf: due })
  assert.equal(position.available, true)
  assert.equal(position.totalOverdue, 0)
  assert.ok(position.actualPaid === emi)
  assert.ok(position.outstandingPrincipal < loan.principal)
}

// Partial payment: the payment remains an actual payment and only consumes the oldest obligation.
{
  const amount = 1000
  const preview = paymentAllocationPreview({ loan, amount, paidOn: due })
  assert.equal(preview.available, true)
  assert.equal(preview.allocatedAmount, amount)
  assert.equal(preview.allocations.length, 1)
  assert.equal(preview.allocations[0].obligationId, `${loan.id}:emi:1`)
}

// Late payment: overdue interest is consumed before scheduled interest/principal.
{
  const position = deriveLoanPosition({ loan, payments: [], asOf: late })
  assert.ok(position.totalOverdue > 0)
  const preview = paymentAllocationPreview({ loan, amount: emi, paidOn: late })
  assert.equal(preview.available, true)
  const allocation = preview.allocations[0]
  assert.ok(allocation.overdueInterest > 0)
  assert.ok(allocation.scheduledInterest > 0)
  assert.ok(allocation.scheduledPrincipal > 0)
}

// Multiple overdue EMIs: the chronological queue is preserved.
{
  const position = deriveLoanPosition({ loan, payments: [], asOf: later })
  assert.ok(position.overdue.length >= 3)
  const preview = paymentAllocationPreview({ loan, amount: position.totalOverdue, paidOn: later })
  assert.equal(preview.available, true)
  assert.ok(preview.allocations.length >= 3)
}

// Payment crossing obligations: one payment may settle several oldest overdue obligations, but never becomes a prepayment.
{
  const position = deriveLoanPosition({ loan, payments: [], asOf: later })
  const amount = position.overdue[0].overdueAmount + position.overdue[1].overdueAmount
  const preview = paymentAllocationPreview({ loan, amount, paidOn: later })
  assert.equal(preview.available, true)
  assert.ok(preview.allocations.length >= 2)
  assert.equal(position.actualPrepayment, 0)
}

// Prepayment is blocked while any overdue EMI remains.
{
  const estimate = calculatePrepaymentEstimate({ loan, payments: [], prepayments: [], amount: 50000, paidOn: late })
  assert.equal(estimate.available, false)
  assert.equal(estimate.reason, 'OVERDUE_EMI_MUST_BE_SETTLED_FIRST')
}

// After overdue obligations are settled, prepayment directly reduces principal and keeps EMI unchanged.
{
  const onTimePayment = { id: 'p1', loanId: loan.id, amount: emi, paidOn: due, status: 'PAID' }
  const position = deriveLoanPosition({ loan, payments: [onTimePayment], prepayments: [], asOf: due })
  const estimate = calculatePrepaymentEstimate({ loan, payments: [onTimePayment], prepayments: [], amount: 50000, paidOn: due })
  assert.equal(estimate.available, true)
  assert.equal(estimate.appliedAmount, 50000)
  assert.equal(estimate.outstandingAfter, position.outstandingPrincipal - 50000)
  assert.equal(estimate.effect, 'REDUCE_TENURE_KEEP_EMI')
  assert.equal(estimate.prepaymentCharge, 0)

  const after = deriveLoanPosition({
    loan,
    payments: [onTimePayment],
    prepayments: [{ id: 'pp1', loanId: loan.id, amount: 50000, paidOn: due, status: 'Applied' }],
    asOf: due,
  })
  assert.equal(after.actualPrepayment, 50000)
  assert.equal(after.actualFinancingOutflow, emi + 50000)
  assert.equal(after.outstandingPrincipal, estimate.outstandingAfter)
}

console.log('Loan finance E2E contract passed: source forms, persistence boundary, payment allocation, overdue scenarios, prepayment gating, principal/outflow and downstream finance inputs.')
