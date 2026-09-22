import assert from 'node:assert/strict'
import { PerformanceService } from '../application/performance/performanceService.js'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'
import { generateUUID } from '../utils/uuid.js'

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

const historical = derivePerformance(base, range)
const futureFuel = { ...base, fuelLogs: [...base.fuelLogs, { capturedAt:'2026-09-11T18:00:00Z', odometer:1400, quantityKg:10, amount:10000, isFullTank: true, vehicleId: 'v1' }] }
const historicalWithFutureFuel = derivePerformance(futureFuel, range)
assert.equal(historicalWithFutureFuel.fuelCostPerKm, historical.fuelCostPerKm)
const historicalServiceWithFutureFuel = PerformanceService.getMetrics(futureFuel, range)
assert.equal(historicalServiceWithFutureFuel.monthlyBreakEvenRevenue, PerformanceService.getMetrics(base, range).monthlyBreakEvenRevenue)

const futureOperational = { ...base, trips: [...base.trips, { id:'future', status:'COMPLETED', tripStartAt:'2026-09-11T09:00:00Z', tripEndAt:'2026-09-11T10:00:00Z', tripKm:500, revenue:99999 }] }
const historicalWithFutureOperations = derivePerformance(futureOperational, range)
assert.equal(historicalWithFutureOperations.revenue, historical.revenue)
assert.equal(historicalWithFutureOperations.vehicleKm, historical.vehicleKm)

const deletedTrip = { ...base.trips[0], deletedAt:'2026-09-10T20:00:00Z', deleted:true }
const withoutDeletedTrip = derivePerformance({ ...base, trips:[deletedTrip] }, range)
assert.equal(withoutDeletedTrip.revenue, 0)
assert.equal(withoutDeletedTrip.businessKm, 0)

const holiday = PerformanceService.getMetrics({ ...base, trips:[] }, range)
assert.equal(holiday.driverTargetAvailable, false)
assert.equal(holiday.driverTarget, null)
assert.equal(holiday.counts.activeFinancialDays, 0)

const twoDays = {
  ...base,
  trips: [...base.trips, { id:'t2', status:'COMPLETED', tripStartAt:'2026-09-11T09:00:00Z', tripEndAt:'2026-09-11T10:00:00Z', tripKm:80, revenue:500 }],
  shifts: [
    base.shifts[0],
    { id:'s2', shiftStartAt:'2026-09-11T08:00:00Z', shiftEndAt:'2026-09-11T18:00:00Z', startOdometer:1200, endOdometer:1300, toll:0, parking:0 },
  ],
}
const twoDayRange = { from:new Date('2026-09-10T00:00:00Z'), to:new Date('2026-09-11T23:59:59Z') }
const twoDayMetrics = PerformanceService.getMetrics(twoDays, twoDayRange)
assert.equal(twoDayMetrics.driverTargetAvailable, true)
assert.equal(twoDayMetrics.counts.activeFinancialDays, 2)
assert.equal(twoDayMetrics.driverTargetBase, twoDayMetrics.dailyBreakEvenRevenue + 500 / twoDayMetrics.driverTargetRemainingEligibleDays)
assert.equal(twoDayMetrics.driverTarget, twoDayMetrics.driverTargetBase + twoDayMetrics.driverTargetRecoveryAdjustment)
assert.equal(twoDayMetrics.driverTargetRecoveryAdjustment, twoDayMetrics.driverTargetDailyRecovery)
assert.equal(twoDayMetrics.pace.paceVariance, twoDayMetrics.revenuePerActiveDay - twoDayMetrics.target)
assert.equal(twoDayMetrics.driverTargetOpeningBalance, 0)

const defaultCalendarDays = PerformanceService.getMetrics({
  ...base,
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:500 }],
}, range)
assert.equal(defaultCalendarDays.driverTargetAvailable, true)
assert.equal(defaultCalendarDays.driverTargetRemainingEligibleDays, 21)

const holidaySmoothing = PerformanceService.getMetrics({
  ...base,
  shifts: [
    base.shifts[0],
    { id:'s2', shiftStartAt:'2026-09-11T08:00:00Z', shiftEndAt:'2026-09-11T18:00:00Z', startOdometer:1200, endOdometer:1250, toll:0, parking:0 },
    { id:'s3', shiftStartAt:'2026-09-12T08:00:00Z', shiftEndAt:'2026-09-12T18:00:00Z', startOdometer:1250, endOdometer:1300, toll:0, parking:0 },
  ],
  trips: [
    base.trips[0],
    { id:'t2', status:'COMPLETED', tripStartAt:'2026-09-12T09:00:00Z', tripEndAt:'2026-09-12T10:00:00Z', tripKm:40, revenue:0 },
  ],
}, { from:new Date('2026-09-10T00:00:00Z'), to:new Date('2026-09-12T23:59:59Z') })
assert.equal(holidaySmoothing.driverTargetAvailable, true)
assert.equal(
  holidaySmoothing.driverTargetEffectiveMonthlyTarget,
  holidaySmoothing.monthlyBreakEvenRevenue +
    500 +
    holidaySmoothing.driverTargetOpeningBalance,
)
assert.ok(holidaySmoothing.driverTarget > 0)
assert.equal(holidaySmoothing.driverTargetNewRecovery, 0)
assert.equal(holidaySmoothing.driverTargetClosingRecovery, 0)

const normalTarget = PerformanceService.getMetrics(base, range)
const higherTarget = PerformanceService.getMetrics({
  ...base,
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:1500, workingDays:2 }],
}, range)
for (const key of ['revenue','vehicleKm','businessKm','deadKm','fuelCost','fuelQty','fuelCostPerKm','toll','parking','actualMaintenance','loanScheduledObligation','renewalProvision','operatingProfit','availableCash','breakEvenRevenue','monthlyBreakEvenRevenue']) {
  assert.equal(higherTarget[key], normalTarget[key], `Driver Target changed actual field ${key}`)
}
assert.notEqual(higherTarget.driverTarget, normalTarget.driverTarget)

const malformedLoan = PerformanceService.getMetrics({ ...base, loans:[{ principal:550000, annualInterestRate:10, tenureMonths:60 }] }, range)
assert.equal(malformedLoan.completeness.loan, false)
assert.equal(Number.isNaN(malformedLoan.loanScheduledObligation), true)
const blankTenureLoan = PerformanceService.getMetrics({ ...base, loans:[{ principal:550000, annualInterestRate:10, startDate:'2026-04-09', tenureMonths:'' }] }, range)
assert.equal(blankTenureLoan.completeness.loan, false)
assert.equal(Number.isNaN(blankTenureLoan.loanScheduledObligation), true)

const id1 = generateUUID(); const id2 = generateUUID()
assert.equal(typeof id1, 'string'); assert.equal(typeof id2, 'string'); assert.notEqual(id1, id2)

console.log('Calculation-boundary confirmed contract: PASS')
