import assert from 'node:assert/strict'
import { PerformanceService } from '../application/performance/performanceService.js'
import { generateUUID } from '../utils/uuid.js'
import { deriveDailyRevenueAllocation } from '../domain/performance/dailyRevenueAllocation.js'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'
import { calculatePreBusinessLoanRecovery } from '../domain/finance/loanEngine.js'

const range = { from: new Date('2026-09-10T00:00:00Z'), to: new Date('2026-09-10T23:59:59Z') }
const base = {
  shifts: [{ id:'s1', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1000, endOdometer:1200, toll:100, parking:50 }],
  trips: [{ id:'t1', status:'COMPLETED', tripStartAt:'2026-09-10T09:00:00Z', tripEndAt:'2026-09-10T10:00:00Z', tripKm:150, revenue:2000 }],
  fuelLogs: [
    { capturedAt:'2026-09-01T18:00:00Z', odometer:800, quantityKg:10, amount:2000, isFullTank: true, vehicleId: 'v1' },
    { capturedAt:'2026-09-05T18:00:00Z', odometer:1000, quantityKg:10, amount:2000, isFullTank: true, vehicleId: 'v1' },
    { capturedAt:'2026-09-10T18:00:00Z', odometer:1200, quantityKg:10, amount:2200, isFullTank: true, vehicleId: 'v1' },
  ],
  maintenance: [], compliance: [], loans: [
    { id:'loan1', principal:550000, annualInterestRate:10, tenureMonths:60, startDate:'2026-04-09', status:'Active' },
  ],
  loanPayments: [], prepayments: [],
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:500, workingDays:2 }],
  breakEvenInputs: [{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:2 }],
}

const empty = PerformanceService.getMetrics({}, range)
assert.equal(empty.driverTargetAvailable, false)
assert.equal(empty.driverTarget, null)
assert.equal(empty.completeness.breakEven, false)

// Future records must not leak into an earlier actual-performance period or its
// monthly break-even as-of boundary.
const historical = derivePerformance(base, range)
const historicalService = PerformanceService.getMetrics(base, range)
const futureFuel = { ...base, fuelLogs: [...base.fuelLogs, { capturedAt:'2026-09-11T18:00:00Z', odometer:1400, quantityKg:10, amount:10000, isFullTank: true, vehicleId: 'v1' }] }
const historicalWithFutureFuel = derivePerformance(futureFuel, range)
assert.equal(historicalWithFutureFuel.fuelCostPerKm, historical.fuelCostPerKm)
const historicalServiceWithFutureFuel = PerformanceService.getMetrics(futureFuel, range)
assert.equal(historicalServiceWithFutureFuel.monthlyBreakEvenRevenue, historicalService.monthlyBreakEvenRevenue, 'Future fuel must not change the normalized monthly BE as-of boundary')

const futureOperational = { ...base, trips: [...base.trips, { id:'future', status:'COMPLETED', tripStartAt:'2026-09-11T09:00:00Z', tripEndAt:'2026-09-11T10:00:00Z', tripKm:500, revenue:99999 }] }
const historicalWithFutureOperations = derivePerformance(futureOperational, range)
assert.equal(historicalWithFutureOperations.revenue, historical.revenue)
assert.equal(historicalWithFutureOperations.vehicleKm, historical.vehicleKm)

// Soft-deleted source records are excluded from actual calculations and financial-day classification.
const deletedTrip = { ...base.trips[0], deletedAt:'2026-09-10T20:00:00Z', deleted:true }
const withoutDeletedTrip = PerformanceService.getMetrics({ ...base, trips:[deletedTrip] }, range)
assert.equal(withoutDeletedTrip.revenue, 0)
assert.equal(withoutDeletedTrip.completeness.target, true, 'Deleted trips do not affect the monthly target input')
assert.ok(Number.isFinite(withoutDeletedTrip.driverTarget))

// A started shift alone is not a target-bearing financial day.
const holiday = PerformanceService.getMetrics({ ...base, trips:[] }, range)
assert.equal(holiday.driverTargetAvailable, true, 'Target remains available before first trip')
assert.ok(Number.isFinite(holiday.driverTarget))
assert.equal(holiday.counts.activeFinancialDays, 0)


// Monthly target guidance uses the calendar-day divisor for the target month.
// Configured workingDays is not a competing divisor.
const financialDay = PerformanceService.getMetrics(base, range)
assert.equal(financialDay.driverTargetAvailable, true)
assert.ok(Math.abs(financialDay.dailyBreakEvenRevenue - financialDay.monthlyBreakEvenRevenue / 30) < 1e-10)
assert.ok(Math.abs(financialDay.driverTargetBase - (financialDay.dailyBreakEvenRevenue + 500 / 30)) < 1e-10)

const workingDays2 = PerformanceService.getMetrics(base, range)
const workingDays20 = PerformanceService.getMetrics({ ...base, driverTargets:[{ ...base.driverTargets[0], workingDays:20 }] }, range)
assert.equal(workingDays2.driverTarget, workingDays20.driverTarget)

// A holiday does not alter the calendar-day target.
const withLaterFinancialDay = {
  ...base,
  trips: [
    base.trips[0],
    { id:'later', status:'COMPLETED', tripStartAt:'2026-09-12T09:00:00Z', tripEndAt:'2026-09-12T10:00:00Z', tripKm:40, revenue:0 },
  ],
}
const later = PerformanceService.getMetrics(withLaterFinancialDay, { from:new Date('2026-09-10T00:00:00Z'), to:new Date('2026-09-12T23:59:59Z') })
assert.equal(later.driverTargetAvailable, true)
assert.ok(later.driverTarget > 0)
assert.equal(later.driverTargetEffectiveMonthlyTarget, later.monthlyBreakEvenRevenue + 500)
assert.equal(later.driverTargetBase, later.driverTargetEffectiveMonthlyTarget / 30)
assert.ok(later.driverTarget >= later.driverTargetBase)

// Malformed loan data is treated as incomplete rather than throwing or fabricating a schedule.
const malformedLoan = PerformanceService.getMetrics({ ...base, loans:[{ principal:550000, annualInterestRate:10, tenureMonths:60 }] }, range)
assert.equal(malformedLoan.completeness.loan, false)
assert.equal(Number.isNaN(malformedLoan.loanScheduledObligation), true)
const blankTenureLoan = PerformanceService.getMetrics({ ...base, loans:[{ principal:550000, annualInterestRate:10, startDate:'2026-04-09', tenureMonths:'' }] }, range)
assert.equal(blankTenureLoan.completeness.loan, false)
assert.equal(Number.isNaN(blankTenureLoan.loanScheduledObligation), true)

const id1 = generateUUID(); const id2 = generateUUID()
assert.equal(typeof id1, 'string'); assert.equal(typeof id2, 'string'); assert.notEqual(id1, id2)

console.log('Calculation-boundary adversarial contract: PASS')

// Revenue allocation contract: the daily reservation percentages are derived
// from the modeled monthly obligations and normalized break-even, rather than
// from an arbitrary fixed percentage.
const allocation = deriveDailyRevenueAllocation({
  revenue: 5000,
  monthlyBreakEvenRevenue: 10000,
  scheduledEmi: 3000,
  preBusinessRecovery: 500,
  maintenanceProvision: 1000,
  complianceProvision: 500,
  historicalMaintenanceRecovery: 0,
})
assert.equal(allocation.available, true)
assert.equal(allocation.allocations.financialObligation, 1750)
assert.equal(allocation.allocations.maintenanceProvision, 500)
assert.equal(allocation.allocations.complianceProvision, 250)
assert.equal(allocation.totalAllocation, 2500)
assert.equal(allocation.availableAfterAllocations, 2500)
assert.equal(allocation.allocationCoverage, 0.5)

// Actual payment clears the corresponding accumulated provision bucket.
const provisionSnapshot = {
  shifts: [{ id:'p1', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1000, endOdometer:1100, revenue:5000 }],
  trips: [], fuelLogs: [], maintenance: [],
  compliance: [{ id:'c1', validFrom:'2026-09-01', validUntil:'2026-09-30', cost:3000, active:true }],
  settlements: [
    { id:'m-pay', sourceType:'Maintenance', direction:'OUT', amount:200, paidOn:'2026-09-10T20:00:00Z' },
    { id:'c-pay', sourceType:'Compliance', sourceId:'c1', direction:'OUT', amount:1100, paidOn:'2026-09-10T21:00:00Z' },
  ],
  breakEvenInputs: [{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:2, active:true }],
}
const beforePayments = derivePerformance({ ...provisionSnapshot, settlements: [] }, range)
assert.equal(beforePayments.maintenanceProvisionAccumulated, 200)
assert.equal(beforePayments.maintenanceProvisionBalance, 200)
assert.equal(beforePayments.complianceProvisionAccumulatedById.c1, 1100)
assert.equal(beforePayments.complianceProvisionBalancesById.c1, 1100)
const afterPayments = derivePerformance(provisionSnapshot, range)
assert.equal(afterPayments.maintenanceProvisionBalance, 0)
assert.equal(afterPayments.complianceProvisionBalancesById.c1, 0)
assert.equal(afterPayments.complianceProvisionBalance, 0)

// Pre-business loan burden is outside the business period and is recovered
// only from the business-start boundary onward.
const preBusinessLoan = {
  id:'pre-business-loan',
  principal:12000,
  tenureMonths:12,
  startDate:'2026-04-01T00:00:00+05:30',
  annualInterestRatePercent:10,
  status:'ACTIVE',
}
const preBusinessRecoveryBeforeStart = calculatePreBusinessLoanRecovery({
  loan: preBusinessLoan,
  payments: [],
  prepayments: [],
  businessStartDate:'2026-09-15T00:00:00+05:30',
  asOf:'2026-09-14T23:59:59+05:30',
})
const preBusinessRecoveryAfterStart = calculatePreBusinessLoanRecovery({
  loan: preBusinessLoan,
  payments: [],
  prepayments: [],
  businessStartDate:'2026-09-15T00:00:00+05:30',
  asOf:'2026-09-16T23:59:59+05:30',
})
assert.equal(preBusinessRecoveryBeforeStart, 0)
assert.ok(preBusinessRecoveryAfterStart > 0)

// Actual vs provisional P/L remain distinct: actual subtracts actual operating
// expenses plus scheduled EMI; provisional additionally reserves the modeled
// maintenance/compliance and historical recovery obligations.
const profitSnapshot = {
  businessSetup:{ businessStartDate:'2026-09-01' },
  shifts:[{ id:'profit-shift', shiftStartAt:'2026-09-10T08:00:00+05:30', shiftEndAt:'2026-09-10T18:00:00+05:30', startOdometer:1000, endOdometer:1100, revenue:5000 }],
  trips:[], fuelLogs:[
    { id:'pf0', capturedAt:'2026-09-09T18:00:00+05:30', odometer:900, amount:2000, quantityKg:10, isFullTank:true, vehicleId:'v1' },
    { id:'pf1', capturedAt:'2026-09-10T18:00:00+05:30', odometer:1000, amount:2000, quantityKg:10, isFullTank:true, vehicleId:'v1' },
  ],
  maintenance:[], compliance:[],
  loans:[preBusinessLoan], loanPayments:[], prepayments:[],
  breakEvenInputs:[{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:2, active:true }],
  vehicles:[{ id:'v1', acquiredOn:'2026-05-01', openingOdometerKm:0 }],
}
const profitMetrics = PerformanceService.getMetrics(profitSnapshot, range)
assert.ok(Number.isFinite(profitMetrics.performanceHeadlineActualProfit))
assert.ok(Number.isFinite(profitMetrics.performanceHeadlineProvisionalProfit))
assert.equal(profitMetrics.performanceHeadlineActualProfit, profitMetrics.operatingProfit - profitMetrics.performanceHeadlineScheduledEmi)
assert.ok(profitMetrics.performanceHeadlineProvisionalProfit <= profitMetrics.performanceHeadlineActualProfit)

// Period-boundary inclusion is explicit for day/week/month-style ranges: the
// record at the boundary is included while a record immediately outside is not.
const boundarySnapshot = {
  ...base,
  shifts: [
    { id:'start', shiftStartAt:'2026-09-10T00:00:00Z', shiftEndAt:'2026-09-10T01:00:00Z', startOdometer:1000, endOdometer:1010, revenue:100 },
    { id:'end', shiftStartAt:'2026-09-10T22:00:00Z', shiftEndAt:'2026-09-10T23:59:59Z', startOdometer:1010, endOdometer:1020, revenue:200 },
    { id:'outside', shiftStartAt:'2026-09-11T00:00:00Z', shiftEndAt:'2026-09-11T01:00:00Z', startOdometer:1020, endOdometer:1030, revenue:999 },
  ],
}
const boundaryMetrics = derivePerformance(boundarySnapshot, range)
assert.equal(boundaryMetrics.revenue, 300)
assert.equal(boundaryMetrics.vehicleKm, 20)

// Invalid/zero data must not fabricate a positive operating-KM forecast input.
const invalidForecast = PerformanceService.getMetrics({
  ...base,
  shifts:[{ id:'bad-km', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1000, endOdometer:900, revenue:1000 }],
}, range)
assert.ok(Number.isFinite(invalidForecast.operatingKmForecast.dailyForecastKm))
assert.equal(invalidForecast.operatingKmForecast.observedKm, 0)

