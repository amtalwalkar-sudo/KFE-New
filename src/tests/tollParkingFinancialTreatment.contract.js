import assert from 'node:assert/strict'
import { deriveFinancialRevenue, reconcileShiftRevenue } from '../domain/work/revenueReconciliation.js'
import { normalizeShiftInput, normalizeTripInput } from '../domain/canonicalNormalization.js'

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

const mixed = reconcileShiftRevenue({
  shiftRevenue: 500,
  toll: 5,
  parking: 2,
  tollTreatment: 'INCLUDED',
  parkingTreatment: 'EXCLUDED',
  trips: [{
    status: 'COMPLETED', revenue: 500, toll: 20, parking: 10,
    tollTreatment: 'INCLUDED', parkingTreatment: 'EXCLUDED'
  }]
})
assert.equal(mixed.reconciliationStatus, 'RECONCILED')
assert.equal(mixed.financialRevenue, 475, 'Only included toll is removed from customer-paid revenue')
assert.equal(mixed.toll, 25, 'Trip and additional shift toll must both remain in the expense ledger')
assert.equal(mixed.parking, 12, 'Trip and additional shift parking must both remain in the expense ledger')
assert.equal(mixed.includedPassThrough, 25, 'Included toll is pass-through')
assert.equal(mixed.excludedActualExpense, 12, 'Excluded parking is an actual expense counted once')
assert.equal(mixed.additionalToll, 5, 'Shift-level toll is additional-only')
assert.equal(mixed.additionalParking, 2, 'Shift-level parking is additional-only')
assert.equal(normalizeTripInput({ tollTreatment: 'excluded' }).tollTreatment, 'EXCLUDED')
assert.equal(normalizeShiftInput({ tollTreatment: 'included', parkingTreatment: 'excluded' }).parkingTreatment, 'EXCLUDED')
assert.throws(() => normalizeTripInput({ parkingTreatment: 'SOMETIMES' }), /INCLUDED or EXCLUDED/)

console.log('BR-11 independent toll/parking treatment contract passed.')
