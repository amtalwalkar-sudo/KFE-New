import assert from 'node:assert/strict'
import { derivePerformance, previousRange } from '../domain/performance/performanceEngineV2.js'

const range = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-30T23:59:59Z') }
const snapshot = {
  shifts: [{ id:'s1', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1000, endOdometer:1200, toll:100, parking:50 }],
  trips: [{ id:'t1', status:'COMPLETED', tripStartAt:'2026-09-10T09:00:00Z', tripEndAt:'2026-09-10T12:00:00Z', tripKm:150, revenue:1000 }],
  fuelLogs: [{ capturedAt:'2026-09-10T18:00:00Z', quantityKg:10, amount:820 }],
  maintenance: [{ performedOn:'2026-09-10', cost:300 }],
  compliance: [{ validFrom:'2026-01-01', validUntil:'2026-12-31', cost:12000 }],
  loans: [{ id:'loan1', principal:550000, annualInterestRate:10, tenureMonths:60, startDate:'2026-04-01', status:'Closed' }],
  loanPayments: [{ loanId:'loan1', paidOn:'2026-09-05', amount:12000, charges:100, status:'Paid' }],
  prepayments: [{ loanId:'loan1', paidOn:'2026-09-15', amount:5000 }],
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', targetRevenue:2000, active:true }],
  breakEvenInputs: [{ effectiveFrom:'2026-09-01', fixedCosts:500, variableCostPerKm:2, variableCostPerHour:10, active:true }],
}
const m = derivePerformance(snapshot, range, previousRange(range))
assert.equal(m.revenue, 1000)
assert.equal(m.vehicleKm, 200)
assert.equal(m.businessKm, 150)
assert.equal(m.deadKm, 50)
assert.equal(m.fuelCost, 820)
assert.equal(m.actualMaintenance, 300)
assert.equal(m.runningCost, 1270)
assert.equal(m.operatingProfit, -270)
assert.equal(m.actualLoanPaid, 12100)
assert.equal(m.actualPrepayment, 5000)
assert.equal(m.actualFinancingOutflow, 17100)
assert.equal(m.availableCash, -17370)
assert.equal(m.cashSurplusAfterFinancing, -17370)
assert.equal(m.provisionSetAside, m.provisionRequired)
assert.equal(m.provisionAdjustedProfit, m.operatingProfit - m.provisionRequired)
assert.equal(m.completeness.target, true)
assert.equal(m.completeness.loan, true)
assert.equal(m.completeness.breakEven, true)
assert.ok(Number.isFinite(m.loanScheduledObligation))
assert.ok(Number.isFinite(m.actualLoanPaid))
assert.equal(m.authority.deadKm, 'VEHICLE_KM_MINUS_BUSINESS_KM')
console.log('Performance contract passed: canonical sources, dead KM, actual maintenance, actual financing cash flow, provisions and break-even are wired.')
