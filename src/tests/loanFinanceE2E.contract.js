import assert from 'node:assert/strict'
import { ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import { calculateEmi, deriveLoanPosition, paymentAllocationPreview, calculatePrepaymentEstimate } from '../domain/finance/loanEngine.js'

const loan = { id: 'loan-e2e', principal: 550000, tenureMonths: 60, startDate: '2026-01-01', annualInterestRatePercent: 10, status: 'Active' }
const emi = calculateEmi(loan.principal, loan.tenureMonths, loan.annualInterestRatePercent)
assert.ok(emi > 0, 'EMI must be calculated from explicit loan source inputs')
assert.equal(ADMIN_FORM_DEFINITIONS.loan.fields.some(field => field.key === 'emi'), false, 'EMI must not be a user-entered loan source field')
const rateField = ADMIN_FORM_DEFINITIONS.loan.fields.find(field => field.key === 'annualInterestRatePercent')
assert.ok(rateField, 'Annual interest rate must be an editable loan source field')
assert.equal('defaultValue' in rateField, false, 'KFE must not supply a default loan interest rate')
assert.equal(rateField.required, true)
assert.equal(ADMIN_FORM_DEFINITIONS.loanPayment.calculationRole, 'authoritative-payment-record')
assert.equal(ADMIN_FORM_DEFINITIONS.prepayment.calculationRole, 'authoritative-prepayment-record')

// Each loan carries its own entered rate; there is no KFE-wide default.
{
  const alternateLoan = { ...loan, id: 'loan-e2e-alt', annualInterestRatePercent: 12 }
  const alternateEmi = calculateEmi(alternateLoan.principal, alternateLoan.tenureMonths, alternateLoan.annualInterestRatePercent)
  const tenPercentEmi = calculateEmi(alternateLoan.principal, alternateLoan.tenureMonths, 10)
  assert.ok(alternateEmi > tenPercentEmi)
  const alternatePosition = deriveLoanPosition({ loan: alternateLoan, asOf: '2026-02-01' })
  assert.equal(alternatePosition.annualInterestRatePercent, 12)
  assert.equal(alternatePosition.emi, alternateEmi)
}
assert.throws(() => calculateEmi(loan.principal, loan.tenureMonths), /annual interest rate is required/i)

const due = '2026-02-01'
const late = '2026-02-11'
const later = '2026-04-01'

{
  // Advance EMI payments after loan origination must be allocatable to the next
  // scheduled installment even when its due date has not arrived yet.
  const earlyPaidOn = '2026-01-15'
  const amount = Math.min(emi - 0.67, 11324)
  const preview = paymentAllocationPreview({ loan, amount, paidOn: earlyPaidOn })
  assert.equal(preview.available, true, 'an advance payment below the EMI must not be rejected')
  assert.equal(preview.allocatedAmount, amount)
  assert.equal(preview.allocations[0].obligationId, `${loan.id}:emi:1`)
  const earlyPayment = { id: 'early-p1', loanId: loan.id, amount, paidOn: earlyPaidOn, status: 'PAID' }
  const position = deriveLoanPosition({ loan, payments: [earlyPayment], asOf: earlyPaidOn })
  assert.equal(position.actualPaid, amount)
  assert.equal(position.schedule[0].paidAmount, amount, 'saved advance payment must be reflected in installment allocation')
  assert.ok(position.schedule[0].dueDate > earlyPaidOn, 'regression must cover payment before the EMI due date')
  assert.ok(position.provisionBalance >= 0, 'advance EMI payments must not drive the accrued provision bucket negative')
  assert.ok(position.paymentsAheadOfAccrual > 0, 'advance payment above accrued EMI provision is reported separately')
}
{
  const beforeLoanStart = paymentAllocationPreview({ loan, amount: 1000, paidOn: '2025-12-31' })
  assert.equal(beforeLoanStart.available, false, 'payments before loan origination must not be allocated')
  assert.equal(beforeLoanStart.reason, 'PAYMENT_EXCEEDS_EMI_OBLIGATIONS')
}

{
  const position = deriveLoanPosition({ loan, payments: [{ id: 'p1', loanId: loan.id, amount: emi, paidOn: due, status: 'PAID' }], asOf: due })
  assert.equal(position.available, true); assert.equal(position.totalOverdue, 0); assert.ok(position.actualPaid === emi); assert.ok(position.outstandingPrincipal < loan.principal)
}
{
  const amount = 1000
  const preview = paymentAllocationPreview({ loan, amount, paidOn: due })
  assert.equal(preview.available, true); assert.equal(preview.allocatedAmount, amount); assert.equal(preview.allocations.length, 1); assert.equal(preview.allocations[0].obligationId, `${loan.id}:emi:1`)
}
{
  const position = deriveLoanPosition({ loan, payments: [], asOf: late })
  assert.ok(position.totalOverdue > 0)
  const preview = paymentAllocationPreview({ loan, amount: emi, paidOn: late })
  assert.equal(preview.available, true)
  const allocation = preview.allocations[0]
  assert.ok(allocation.overdueInterest > 0); assert.ok(allocation.scheduledInterest > 0); assert.ok(allocation.scheduledPrincipal > 0)
}
{
  const position = deriveLoanPosition({ loan, payments: [], asOf: later })
  assert.ok(position.overdue.length >= 3)
  const preview = paymentAllocationPreview({ loan, amount: position.totalOverdue, paidOn: later })
  assert.equal(preview.available, true); assert.ok(preview.allocations.length >= 3)
}
{
  const position = deriveLoanPosition({ loan, payments: [], asOf: later })
  const amount = position.overdue[0].overdueAmount + position.overdue[1].overdueAmount
  const preview = paymentAllocationPreview({ loan, amount, paidOn: later })
  assert.equal(preview.available, true); assert.ok(preview.allocations.length >= 2); assert.equal(position.actualPrepayment, 0)
}
{
  const estimate = calculatePrepaymentEstimate({ loan, payments: [], prepayments: [], amount: 50000, paidOn: late })
  assert.equal(estimate.available, false); assert.equal(estimate.reason, 'OVERDUE_EMI_MUST_BE_SETTLED_FIRST')
}
{
  const onTimePayment = { id: 'p1', loanId: loan.id, amount: emi, paidOn: due, status: 'PAID' }
  const position = deriveLoanPosition({ loan, payments: [onTimePayment], prepayments: [], asOf: due })
  const estimate = calculatePrepaymentEstimate({ loan, payments: [onTimePayment], prepayments: [], amount: 50000, paidOn: due })
  assert.equal(estimate.available, true); assert.equal(estimate.appliedAmount, 50000); assert.equal(estimate.outstandingAfter, position.outstandingPrincipal - 50000); assert.equal(estimate.effect, 'REDUCE_TENURE_KEEP_EMI'); assert.equal(estimate.prepaymentCharge, 0)
  const after = deriveLoanPosition({ loan, payments: [onTimePayment], prepayments: [{ id: 'pp1', loanId: loan.id, amount: 50000, paidOn: due, status: 'Applied' }], asOf: due })
  assert.equal(after.actualPrepayment, 50000); assert.equal(after.actualFinancingOutflow, emi + 50000); assert.equal(after.outstandingPrincipal, estimate.outstandingAfter)
}


{
  // Missing and malformed dates are diagnostic-invalid records: they must
  // not be allocated to an EMI or counted as actual cash paid.
  const invalidDatedPayments = [
    { id: 'missing-date', loanId: loan.id, amount: 1000, status: 'PAID' },
    { id: 'empty-date', loanId: loan.id, amount: 1000, paidOn: '', status: 'PAID' },
    { id: 'bad-date', loanId: loan.id, amount: 1000, paidOn: 'not-a-date', status: 'PAID' },
    { id: 'valid-date', loanId: loan.id, amount: 500, paidOn: '2026-01-15', status: 'PAID' },
  ]
  const position = deriveLoanPosition({ loan, payments: invalidDatedPayments, asOf: '2026-02-01' })
  assert.equal(position.invalidPaymentCount, 3, 'all missing/invalid dates are counted for correction')
  assert.equal(position.invalidPaymentAmount, 3000, 'invalid-date amounts remain visible but are not treated as paid')
  assert.equal(position.actualPaid, 500, 'only the dated valid payment counts as actual cash')
  assert.equal(position.schedule.reduce((sum, row) => sum + row.paidAmount, 0), 500, 'only valid dated payments reach EMI allocation')
  const missingPreview = paymentAllocationPreview({ loan, amount: 1000, paidOn: null })
  assert.equal(missingPreview.available, false)
  assert.equal(missingPreview.reason, 'INVALID_PAYMENT_DATE')
  const malformedPreview = paymentAllocationPreview({ loan, amount: 1000, paidOn: 'not-a-date' })
  assert.equal(malformedPreview.available, false)
  assert.equal(malformedPreview.reason, 'INVALID_PAYMENT_DATE')
}


{
  // Fully specified synthetic amortization oracle: reconcile the first 36
  // scheduled payments against the canonical schedule and outstanding principal.
  const horizon = '2029-01-01T00:00:00+05:30'
  const unPaidSchedule = deriveLoanPosition({ loan, asOf: horizon })
  const first36 = unPaidSchedule.schedule.slice(0, 36)
  assert.equal(first36.length, 36)
  const syntheticPayments = first36.map((row, index) => ({
    id: `synthetic-36m-payment-${index + 1}`,
    loanId: loan.id,
    amount: emi,
    paidOn: row.dueDate,
    status: 'PAID',
  }))
  const paidPosition = deriveLoanPosition({
    loan,
    payments: syntheticPayments,
    asOf: first36.at(-1).dueDate,
  })
  const fullyPaidInstallments = paidPosition.schedule.filter(row =>
    row.paidAmount >= row.originalEmiAmount - 0.01
  ).length
  const paidPrincipal = paidPosition.schedule.reduce((sum, row) => sum + row.scheduledPrincipalPaid, 0)
  assert.equal(paidPosition.actualPaid, Math.round(36 * emi * 100) / 100)
  assert.equal(fullyPaidInstallments, 36, '36 synthetic payments must settle exactly 36 installments')
  assert.equal(paidPosition.schedule.length - fullyPaidInstallments, 24, 'paid and remaining installments must reconcile to the 60-month original tenure')
  assert.ok(Math.abs(paidPosition.outstandingPrincipal - (loan.principal - paidPrincipal)) < 0.02, 'opening principal less allocated principal must equal outstanding principal')
  assert.ok(paidPosition.outstandingPrincipal > 0 && paidPosition.outstandingPrincipal < loan.principal, '36 scheduled payments must reduce, but not erase, principal for a 60-month loan')
}

console.log('Loan finance E2E contract passed: explicit per-loan rate, no KFE-wide default, source forms, payment allocation, overdue scenarios, prepayment gating, principal/outflow and downstream finance inputs.')
