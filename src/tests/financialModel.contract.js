import assert from 'node:assert/strict'
import { deriveFinanceAwarePerformance } from '../domain/performance/financePerformanceAdapter.js'
import { calculateRollingFuelCostPerKm } from '../domain/math/fuel.js'

const from = new Date('2026-01-01T00:00:00+05:30')
const to = new Date('2026-01-31T23:59:59.999+05:30')
const snapshot = {
  shifts: [{ shiftStartAt: '2026-01-10T08:00:00+05:30', shiftEndAt: '2026-01-10T18:00:00+05:30', startOdometer: 1000, endOdometer: 1150, toll: 100, parking: 50, revenue: 10000 }],
  trips: [{ status: 'COMPLETED', tripStartAt: '2026-01-10T09:00:00+05:30', tripEndAt: '2026-01-10T11:00:00+05:30', revenue: 1, tripKm: 100 }],
  fuelLogs: [
    { capturedAt: '2026-01-01T07:30:00+05:30', odometer: 1000, amount: 2000, quantityKg: 20 },
    { capturedAt: '2026-01-05T07:30:00+05:30', odometer: 1100, amount: 2200, quantityKg: 22 },
    { capturedAt: '2026-01-07T07:30:00+05:30', odometer: 1125, amount: 999, quantityKg: 10, isFullTank: false },
    { capturedAt: '2026-01-10T07:30:00+05:30', odometer: 1200, amount: 2400, quantityKg: 24 }
  ],
  maintenance: [{ performedOn: '2026-01-09T12:00:00+05:30', cost: 300 }], compliance: [],
  loans: [{ id: 'loan-1', lender: 'Test lender', principal: 12000, annualInterestRate: 10, tenureMonths: 12, startDate: '2026-01-01T00:00:00+05:30', status: 'ACTIVE' }],
  loanPayments: [{ loanId: 'loan-1', paidOn: '2026-01-15T00:00:00+05:30', amount: 800, charges: 0, status: 'PAID' }],
  prepayments: [{ loanId: 'loan-1', paidOn: '2026-01-20T00:00:00+05:30', amount: 300, status: 'Applied' }], driverTargets: [],
  breakEvenInputs: [{ effectiveFrom: '2026-01-01T00:00:00+05:30', maintenanceProvisionPerKm: 2 }]
}

const fuel = calculateRollingFuelCostPerKm(snapshot.fuelLogs, 10)
assert.equal(fuel.completedIntervals, 2)
assert.equal(fuel.observations.length, 2)
assert.equal(fuel.rollingCostPerKm, 23)

const m = deriveFinanceAwarePerformance(snapshot, { from, to })
assert.equal(m.revenue, 10000)
assert.equal(m.vehicleKm, 150)
assert.equal(m.businessKm, 100)
assert.equal(m.deadKm, 50)
assert.equal(m.revenuePerKm, 10000 / 150)
assert.equal(m.profitPerKm, m.operatingProfit / 150)
assert.equal(m.fuelCostPerKm, 23)
assert.equal(m.maintenanceProvision, 300)
assert.equal(m.monthlyBreakEvenRevenue, 3750)
assert.ok(Math.abs(m.loanInterest - 101.91780821917808) < 1e-9)
assert.equal(m.actualLoanPaid, 800)
assert.equal(m.actualPrepayment, 300)
assert.equal(m.actualFinancingOutflow, 1100)
assert.equal(m.availableCash, m.operatingProfit - 1100)
assert.equal(m.provisionAdjustedProfit, m.operatingProfit - m.provisionRequired)

console.log('Financial model contract passed: monthly break-even authority, vehicle-KM economics, full-tank rolling fuel cost, explicit loan rate, actual cash, and provisions are separated.')
