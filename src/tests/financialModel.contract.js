import assert from 'node:assert/strict'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'

const from = new Date('2026-01-01T00:00:00')
const to = new Date('2026-01-31T23:59:59.999')
const snapshot = {
  shifts: [{ shiftStartAt: '2026-01-10T08:00:00', shiftEndAt: '2026-01-10T18:00:00', startOdometer: 1000, endOdometer: 1150, toll: 100, parking: 50 }],
  trips: [{ status: 'COMPLETED', tripStartAt: '2026-01-10T09:00:00', tripEndAt: '2026-01-10T11:00:00', revenue: 10000, tripKm: 100 }],
  fuelLogs: [{ capturedAt: '2026-01-10T07:30:00', amount: 2000, quantityKg: 20 }],
  maintenance: [{ performedOn: '2026-01-09T12:00:00', cost: 300 }],
  compliance: [],
  loans: [{ id: 'loan-1', lender: 'Test lender', principal: 12000, annualInterestRate: 0, tenureMonths: 12, startDate: '2026-01-01', status: 'ACTIVE' }],
  loanPayments: [{ loanId: 'loan-1', paidOn: '2026-01-15', amount: 800, charges: 0, status: 'PAID' }],
  prepayments: [],
  driverTargets: [],
  breakEvenInputs: [{ effectiveFrom: '2026-01-01', fixedCosts: 0, variableCostPerKm: 2, variableCostPerHour: 0 }]
}

const m = derivePerformance(snapshot, { from, to })
assert.equal(m.revenue, 10000)
assert.equal(m.runningCost, 2450)
assert.equal(m.operatingProfit, 7550)
assert.equal(m.maintenanceProvision, 200)
assert.equal(m.provisionAdjustedProfit, 7350)
assert.equal(m.loanScheduledObligation, 1000)
assert.equal(m.loanPrincipal, 1000)
assert.equal(m.loanInterest, 0)
assert.equal(m.actualLoanPaid, 800)
assert.equal(m.cashSurplusAfterFinancing, 6750)

console.log('Financial model contract passed: revenue, operating cost/profit, provisions, scheduled financing, and cash-after-financing remain separated.')
