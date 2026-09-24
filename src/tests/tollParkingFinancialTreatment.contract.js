import assert from 'node:assert/strict'
import { deriveFinancialRevenue, reconcileShiftRevenue } from '../domain/work/revenueReconciliation.js'

const included = deriveFinancialRevenue({ customerPaidTotal: 500, toll: 50, parking: 0, tollParkingRevenueTreatment: 'INCLUDED' })
assert.equal(included.financialRevenue, 450)
assert.equal(included.includedPassThrough, 50)
assert.equal(included.excludedActualExpense, 0)

const excluded = deriveFinancialRevenue({ customerPaidTotal: 500, toll: 50, parking: 0, tollParkingRevenueTreatment: 'EXCLUDED' })
assert.equal(excluded.financialRevenue, 500)
assert.equal(excluded.includedPassThrough, 0)
assert.equal(excluded.excludedActualExpense, 50)

const includedBoth = deriveFinancialRevenue({ customerPaidTotal: 1000, toll: 50, parking: 25, tollParkingRevenueTreatment: 'INCLUDED' })
assert.equal(includedBoth.financialRevenue, 925)
assert.equal(includedBoth.excludedActualExpense, 0)

const excludedBoth = deriveFinancialRevenue({ customerPaidTotal: 1000, toll: 50, parking: 25, tollParkingRevenueTreatment: 'EXCLUDED' })
assert.equal(excludedBoth.financialRevenue, 1000)
assert.equal(excludedBoth.excludedActualExpense, 75)

const reconciled = reconcileShiftRevenue({ shiftRevenue: 500, trips: [{ status: 'COMPLETED', revenue: 500 }], toll: 50, tollParkingRevenueTreatment: 'INCLUDED' })
assert.equal(reconciled.reconciliationStatus, 'RECONCILED')
assert.equal(reconciled.financialRevenue, 450)

console.log('BR-11 toll/parking financial treatment contract passed.')
