import assert from 'node:assert/strict'
import { deriveFinancialFactModel } from '../domain/finance/financialFactModel.js'

const range = {
  from: new Date('2026-09-01T00:00:00+05:30'),
  to: new Date('2026-09-30T23:59:59.999+05:30'),
}

const model = deriveFinancialFactModel({
  range,
  metrics: {
    revenue: 10000,
    fuelCost: 2000,
    toll: 100,
    parking: 50,
    actualMaintenance: 300,
    actualOperatingCost: 2450,
    loanScheduledObligation: 1200,
    actualLoanPaid: 1000,
    actualPrepayment: 200,
    actualFinancingOutflow: 1200,
    maintenanceProvision: 250,
    renewalProvision: 400,
    completeness: { loan: true },
    calculationEvidence: { breakEven: { status: 'AUTHORITATIVE' } },
  },
  snapshot: {
    vehicles: [
      { id: 'v1', acquiredOn: '2026-09-10T10:00:00+05:30', acquisitionValue: 50000 },
    ],
    compliancePayments: [
      { id: 'cp1', paidOn: '2026-09-20T10:00:00+05:30', amount: 450 },
    ],
    receivables: [],
    payables: [],
    cashTransactions: [],
  },
})

assert.equal(model.model.actualRevenue, 10000)
assert.equal(model.model.actualOperatingCost, 2450)
assert.equal(model.model.financingObligation, 1200)
assert.equal(model.model.actualFinancingPayment, 1200)
assert.equal(model.model.maintenanceVariance, 50)
assert.equal(model.model.renewalActual, 450)
assert.equal(model.model.renewalVariance, 50)
assert.equal(model.model.capex, 50000)
assert.equal(model.availability.cash, 'UNAVAILABLE')
assert.equal(model.availability.receivable, 'UNAVAILABLE')
assert.equal(model.availability.payable, 'UNAVAILABLE')
assert.equal(model.rules.actualExpensesAreNotCashByDefault, true)
assert.equal(model.rules.provisionsAreNotExpenses, true)
assert.equal(model.rules.obligationsAreNotPayments, true)
assert.ok(model.facts.some(fact => fact.factType === 'FINANCING_OBLIGATION' && fact.basis === 'OBLIGATION'))
assert.ok(model.facts.some(fact => fact.factType === 'FINANCING_PAYMENT' && fact.basis === 'ACTUAL'))
assert.ok(model.facts.some(fact => fact.factType === 'MAINTENANCE_PROVISION' && fact.basis === 'PROVISION'))
assert.ok(model.facts.some(fact => fact.factType === 'CAPEX' && fact.metadata.cashSettlement === 'NOT_ESTABLISHED_BY_ACQUISITION_RECORD'))

const explicitCash = deriveFinancialFactModel({
  range,
  metrics: { actualFinancingOutflow: 1200 },
  snapshot: {
    cashTransactions: [
      { id: 'cash-in', occurredOn: '2026-09-20T10:00:00+05:30', direction: 'IN', amount: 5000 },
      { id: 'cash-out', occurredOn: '2026-09-21T10:00:00+05:30', direction: 'OUT', amount: 800 },
    ],
  },
})
assert.equal(explicitCash.model.cashMovement, 3000)
assert.equal(explicitCash.availability.cash, 'AVAILABLE')

const missingSettlement = deriveFinancialFactModel({
  range,
  metrics: { renewalProvision: 400 },
  snapshot: { compliance: [{ id: 'c1', cost: 400, validFrom: '2026-09-01', validUntil: '2027-08-31' }] },
})
assert.equal(missingSettlement.model.renewalActual, null)
assert.equal(missingSettlement.model.renewalVariance, null)
assert.equal(missingSettlement.availability.renewalVariance, 'UNAVAILABLE')

console.log('FAH-3 financial fact model contract passed: actuals, obligations, payments, provisions, variances, capex, cash/AR/AP settlement boundaries, and non-promotion rules.')
