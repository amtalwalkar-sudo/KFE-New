import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PerformanceService } from '../application/performance/performanceService.js'
import { istDayRange, istMonthRange } from '../domain/time/ist.js'

// This is a deliberately fully specified synthetic vector, separate from the
// unresolved legacy ₹815 / ₹4,672 oracle rows. It must never be presented as
// the user's actual business data.
const month = '2026-10'
const monthRange = istMonthRange(new Date('2026-10-15T12:00:00+05:30'), new Date('2027-01-01T00:00:00+05:30'))
assert.ok(monthRange, 'synthetic month range must be valid')

const shifts = []
let odometer = 0
for (let day = 1; day <= 31; day += 1) {
  const date = `2026-10-${String(day).padStart(2, '0')}`
  const startOdometer = odometer
  odometer += 200
  shifts.push({
    id: `synthetic-break-even-shift-${date}`,
    status: 'COMPLETED',
    shiftStartAt: `${date}T08:00:00+05:30`,
    shiftEndAt: `${date}T18:00:00+05:30`,
    startOdometer,
    endOdometer: odometer,
    revenue: 0,
  })
}

const snapshot = {
  businessSetup: { businessStartDate: '2026-01-01' },
  vehicles: [{ id: 'synthetic-break-even-vehicle', openingOdometerKm: 0, active: true }],
  shifts,
  trips: [],
  fuelLogs: [
    { id: 'synthetic-full-tank-1', vehicleId: 'synthetic-break-even-vehicle', capturedAt: '2026-10-01T07:00:00+05:30', odometer: 0, amount: 640, isFullTank: true },
    { id: 'synthetic-full-tank-2', vehicleId: 'synthetic-break-even-vehicle', capturedAt: '2026-10-02T07:00:00+05:30', odometer: 200, amount: 640, isFullTank: true },
  ],
  maintenance: [],
  // A one-month synthetic compliance obligation makes the expected accrual
  // independently transparent: ₹2,500 over the 31 inclusive October dates.
  compliance: [{
    id: 'synthetic-october-compliance',
    cost: 2500,
    validFrom: '2026-10-01T00:00:00+05:30',
    validUntil: '2026-10-31T23:59:59+05:30',
  }],
  loans: [{
    id: 'synthetic-zero-interest-loan',
    principal: 679440,
    tenureMonths: 60,
    startDate: '2026-01-01T00:00:00+05:30',
    annualInterestRatePercent: 0,
    status: 'Active',
  }],
  loanPayments: [],
  prepayments: [],
  settlements: [],
  breakEvenInputs: [{ id: 'synthetic-maintenance-rate', effectiveFrom: '2026-01-01', maintenanceProvisionPerKm: 1.6, active: true }],
}

const expected = {
  calendarDays: 31,
  kmPerDay: 200,
  forecastMonthlyKm: 6200,
  fuelRateInrPerKm: 3.2,
  fuelCostMonthlyInr: 19840,
  maintenanceRateInrPerKm: 1.6,
  maintenanceProvisionMonthlyInr: 9920,
  complianceProvisionMonthlyInr: 2500,
  emiMonthlyInr: 11324,
  preBusinessRecoveryInr: 0,
  historicalMaintenanceRecoveryInr: 0,
  monthlyBreakEvenInr: 43584,
  actualFuelCashInr: 1280,
  actualProfitInr: -12604,
  provisionalProfitInr: -25024,
  provisionalDeductionInr: 12420,
}
assert.equal(expected.calendarDays * expected.kmPerDay, expected.forecastMonthlyKm)
assert.equal(expected.forecastMonthlyKm * expected.fuelRateInrPerKm, expected.fuelCostMonthlyInr)
assert.equal(expected.forecastMonthlyKm * expected.maintenanceRateInrPerKm, expected.maintenanceProvisionMonthlyInr)
assert.equal(
  expected.emiMonthlyInr + expected.fuelCostMonthlyInr + expected.maintenanceProvisionMonthlyInr + expected.complianceProvisionMonthlyInr,
  expected.monthlyBreakEvenInr,
  'independent complete monthly cost arithmetic must include EMI, fuel, maintenance and compliance',
)

const metrics = PerformanceService.getMetrics(snapshot, monthRange)
assert.equal(metrics.performanceHeadlineScheduledEmi, expected.emiMonthlyInr, 'canonical scheduled EMI must match the specified zero-interest loan')
assert.equal(metrics.breakEvenInputs.vehicleKmBasis, expected.forecastMonthlyKm, 'canonical monthly KM basis must match the 31 daily shift observations')
assert.equal(metrics.breakEvenInputs.fuelCostPerKm, expected.fuelRateInrPerKm, 'canonical full-tank interval must establish ₹3.20/km')
assert.equal(metrics.breakEvenInputs.fuelCostMonthly, expected.fuelCostMonthlyInr)
assert.equal(metrics.breakEvenInputs.maintenanceProvisionMonthly, expected.maintenanceProvisionMonthlyInr)
assert.equal(metrics.breakEvenInputs.complianceProvisionMonthly, expected.complianceProvisionMonthlyInr)
assert.equal(metrics.breakEvenInputs.scheduledEmiMonthly, expected.emiMonthlyInr)
assert.equal(metrics.breakEvenInputs.preBusinessRecoveryMonthly, 0)
assert.equal(metrics.breakEvenInputs.historicalMaintenanceRecoveryMonthly, 0)
assert.equal(metrics.monthlyBreakEvenRevenue, expected.monthlyBreakEvenInr, 'canonical Performance service break-even must equal independent component arithmetic')
assert.equal(metrics.calculationEvidence.breakEven.status, 'AUTHORITATIVE')

assert.equal(metrics.fuelCost, expected.actualFuelCashInr, 'actual P/L uses the two explicit fuel cash records, not forecast fuel cost')
assert.equal(metrics.performanceHeadlineActualProfit, expected.actualProfitInr, 'actual P/L must deduct actual fuel cash and full scheduled EMI')
assert.equal(metrics.maintenanceProvision, expected.maintenanceProvisionMonthlyInr)
assert.equal(metrics.renewalProvision, expected.complianceProvisionMonthlyInr)
assert.equal(metrics.performanceHeadlineProvisionalProfit, expected.provisionalProfitInr, 'provisional P/L must additionally deduct maintenance and compliance accruals')
assert.equal(
  metrics.performanceHeadlineActualProfit - metrics.performanceHeadlineProvisionalProfit,
  expected.provisionalDeductionInr,
  'the independently expected provisional deduction must equal actual minus provisional P/L',
)

// Daily and weekly selected-period views must roll back to the same month totals.
let dailyActual = 0
let dailyProvisional = 0
for (let day = 1; day <= 31; day += 1) {
  const date = `2026-10-${String(day).padStart(2, '0')}`
  const range = istDayRange(date)
  const daily = PerformanceService.getMetrics(snapshot, range)
  dailyActual += daily.performanceHeadlineActualProfit
  dailyProvisional += daily.performanceHeadlineProvisionalProfit
}
assert.ok(Math.abs(dailyActual - expected.actualProfitInr) < 0.02, 'daily actual P/L rollups must reconcile to October')
assert.ok(Math.abs(dailyProvisional - expected.provisionalProfitInr) < 0.02, 'daily provisional P/L rollups must reconcile to October')

let weeklyActual = 0
let weeklyProvisional = 0
for (let startDay = 1; startDay <= 31; startDay += 7) {
  const endDay = Math.min(startDay + 6, 31)
  const from = istDayRange(`2026-10-${String(startDay).padStart(2, '0')}`).from
  const to = istDayRange(`2026-10-${String(endDay).padStart(2, '0')}`).to
  const weekly = PerformanceService.getMetrics(snapshot, { from, to })
  weeklyActual += weekly.performanceHeadlineActualProfit
  weeklyProvisional += weekly.performanceHeadlineProvisionalProfit
}
assert.ok(Math.abs(weeklyActual - expected.actualProfitInr) < 0.02, 'weekly actual P/L rollups must reconcile to October')
assert.ok(Math.abs(weeklyProvisional - expected.provisionalProfitInr) < 0.02, 'weekly provisional P/L rollups must reconcile to October')

const money = value => `₹${Math.round(Number(value)).toLocaleString('en-IN')}`
assert.equal(money(metrics.performanceHeadlineActualProfit), '₹-12,604')
assert.equal(money(metrics.performanceHeadlineProvisionalProfit), '₹-25,024')


console.log('Fully specified synthetic EMI-inclusive break-even and Performance reconciliation: PASS')
