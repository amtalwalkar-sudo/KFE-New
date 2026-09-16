import assert from 'node:assert/strict'
import { PerformanceService } from '../application/performance/performanceService.js'
import { derivePerformance, previousRange } from '../domain/performance/performanceEngineV2.js'

const snapshot = {
  trips: [{ id:'t1', status:'COMPLETED', tripStartAt:'2026-09-10T09:00:00Z', tripEndAt:'2026-09-10T12:00:00Z', tripKm:150, revenue:1000 }],
  shifts: [{ id:'s1', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1000, endOdometer:1200, toll:100, parking:50 }],
  fuelLogs: [
    { capturedAt:'2026-09-04T18:00:00Z', odometer:600, quantityKg:10, amount:2000 },
    { capturedAt:'2026-09-05T18:00:00Z', odometer:800, quantityKg:10, amount:2000 },
    { capturedAt:'2026-09-06T18:00:00Z', odometer:1000, quantityKg:10, amount:2000 },
    { capturedAt:'2026-09-10T18:00:00Z', odometer:1200, quantityKg:10, amount:2200 },
  ],
  maintenance: [{ performedOn:'2026-09-10', cost:300 }],
  loan: { id:'loan1', principal:550000, annualInterestRate:10, tenureYears:5, startDate:'2026-09-01' },
  renewals: [{ type:'insurance', validFrom:'2026-01-01', validUntil:'2026-12-31', cost:24000 }],
  breakEvenInputs: [{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:3, active:true }],
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:1000, workingDays:2, active:true }],
}

const engineSnapshot = {
  ...snapshot,
  loans: [{ ...snapshot.loan, tenureMonths: snapshot.loan.tenureYears * 12 }],
  compliance: snapshot.renewals,
}

const range = { from: new Date('2026-09-10T00:00:00Z'), to: new Date('2026-09-10T23:59:59Z') }
const m = derivePerformance(engineSnapshot, range, previousRange(range))
const serviceMetrics = PerformanceService.getMetrics(snapshot, range)
assert.equal(serviceMetrics.driverTargetAvailable, true)
assert.equal(serviceMetrics.driverTarget, serviceMetrics.target)
assert.equal(serviceMetrics.driverTarget, serviceMetrics.driverTargetBase)
assert.equal(serviceMetrics.completeness.target, true)
assert.equal(serviceMetrics.breakEvenRevenue, m.breakEvenRevenue)
assert.ok(Number.isFinite(serviceMetrics.monthlyBreakEvenRevenue))
assert.equal(serviceMetrics.dailyBreakEvenRevenue, serviceMetrics.monthlyBreakEvenRevenue / 2)
assert.equal(serviceMetrics.driverTargetBase, serviceMetrics.dailyBreakEvenRevenue + 500)
assert.equal(serviceMetrics.driverTarget, serviceMetrics.driverTargetBase)
assert.equal(serviceMetrics.driverTargetRecoveryAdjustment, 0)

const manualDailyTargetInput = {
  ...snapshot,
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:1000, workingDays:2, dailyTarget:1, targetPerActiveDay:2, active:true }],
}
const manualDailyTargetMetrics = PerformanceService.getMetrics(manualDailyTargetInput, range)
assert.equal(manualDailyTargetMetrics.driverTargetAvailable, true)
assert.equal(manualDailyTargetMetrics.target, serviceMetrics.driverTarget)

const higherProfitTargetMetrics = PerformanceService.getMetrics({
  ...snapshot,
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:5000, workingDays:2, active:true }],
}, range)
for (const key of [
  'revenue', 'vehicleKm', 'businessKm', 'deadKm', 'fuelCost', 'fuelQty', 'toll', 'parking',
  'actualMaintenance', 'workingHours', 'runningCost', 'loanScheduledObligation', 'actualLoanPaid',
  'actualPrepayment', 'actualFinancingOutflow', 'renewalProvision', 'operatingProfit',
  'provisionAdjustedProfit', 'availableCash', 'breakEvenRevenue', 'monthlyBreakEvenRevenue',
  'dailyBreakEvenRevenue',
]) assert.equal(higherProfitTargetMetrics[key], serviceMetrics[key], `target input changed actual metric: ${key}`)
assert.ok(Math.abs((higherProfitTargetMetrics.driverTarget - serviceMetrics.driverTarget) - 2000) < 1e-9)

const historicalBaseSnapshot = {
  ...snapshot,
  shifts: [
    { id:'historical', shiftStartAt:'2026-08-05T08:00:00Z', shiftEndAt:'2026-08-05T18:00:00Z', startOdometer:600, endOdometer:800, toll:0, parking:0 },
    ...snapshot.shifts,
  ],
  trips: [
    { id:'historical', status:'COMPLETED', tripStartAt:'2026-08-05T09:00:00Z', tripEndAt:'2026-08-05T12:00:00Z', tripKm:150, revenue:0 },
    ...snapshot.trips,
  ],
  fuelLogs: [
    { capturedAt:'2026-08-01T18:00:00Z', odometer:400, quantityKg:10, amount:2000 },
    { capturedAt:'2026-08-03T18:00:00Z', odometer:600, quantityKg:10, amount:2000 },
    { capturedAt:'2026-08-05T18:00:00Z', odometer:800, quantityKg:10, amount:2000 },
    ...snapshot.fuelLogs,
  ],
  breakEvenInputs: [
    { effectiveFrom:'2026-08-01', effectiveUntil:'2026-08-31', maintenanceProvisionPerKm:3, active:true },
    snapshot.breakEvenInputs[0],
  ],
  driverTargets: [
    { effectiveFrom:'2026-08-01', effectiveUntil:'2026-08-31', desiredDriverProfit:1000, workingDays:2, active:true },
    snapshot.driverTargets[0],
  ],
}
const historicalDeficitMetrics = PerformanceService.getMetrics(historicalBaseSnapshot, range)
assert.ok(historicalDeficitMetrics.driverTargetAvailable, JSON.stringify(historicalDeficitMetrics))
assert.ok(Number.isFinite(historicalDeficitMetrics.driverTargetRollingBalance), JSON.stringify(historicalDeficitMetrics))
assert.ok(historicalDeficitMetrics.driverTarget > historicalDeficitMetrics.driverTargetBase, JSON.stringify(historicalDeficitMetrics))

const historicalSurplusSnapshot = {
  ...historicalBaseSnapshot,
  trips: [
    { id:'historical', status:'COMPLETED', tripStartAt:'2026-08-05T09:00:00Z', tripEndAt:'2026-08-05T12:00:00Z', tripKm:150, revenue:100000 },
    snapshot.trips[0],
  ],
}
const historicalSurplusMetrics = PerformanceService.getMetrics(historicalSurplusSnapshot, range)
assert.equal(historicalSurplusMetrics.driverTargetAvailable, true)
assert.ok(Number.isFinite(historicalSurplusMetrics.driverTargetRollingBalance))
assert.ok(historicalSurplusMetrics.driverTargetRollingBalance < 0)
assert.ok(historicalSurplusMetrics.driverTarget < historicalSurplusMetrics.driverTargetBase)

const changedInput = { ...snapshot, breakEvenInputs: [{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:4, active:true }] }
const changedEngineSnapshot = { ...engineSnapshot, breakEvenInputs: changedInput.breakEvenInputs }
const changedEngineMetrics = derivePerformance(changedEngineSnapshot, range, previousRange(range))
const changedServiceMetrics = PerformanceService.getMetrics(changedInput, range)
assert.equal(changedEngineMetrics.breakEvenRevenue - m.breakEvenRevenue, 200)
assert.equal(changedServiceMetrics.breakEvenRevenue - serviceMetrics.breakEvenRevenue, 200)
assert.equal(changedEngineMetrics.breakEvenRevenue, changedServiceMetrics.breakEvenRevenue)
assert.equal(changedServiceMetrics.monthlyBreakEvenRevenue - serviceMetrics.monthlyBreakEvenRevenue, 200)
assert.equal(changedServiceMetrics.dailyBreakEvenRevenue - serviceMetrics.dailyBreakEvenRevenue, 100)
assert.equal(changedServiceMetrics.driverTargetBase - serviceMetrics.driverTargetBase, 100)

const missingMaintenanceInput = { ...snapshot, breakEvenInputs: [{ effectiveFrom:'2026-09-01', active:true }] }
const missingEngineSnapshot = { ...engineSnapshot, breakEvenInputs: missingMaintenanceInput.breakEvenInputs }
const missingEngineMetrics = derivePerformance(missingEngineSnapshot, range, previousRange(range))
const missingServiceMetrics = PerformanceService.getMetrics(missingMaintenanceInput, range)
assert.equal(missingEngineMetrics.completeness.breakEven, false)
assert.ok(Number.isNaN(missingEngineMetrics.breakEvenRevenue))
assert.equal(missingServiceMetrics.completeness.breakEven, false)
assert.equal(missingServiceMetrics.driverTargetAvailable, false)
assert.equal(missingServiceMetrics.driverTarget, null)
assert.equal(missingServiceMetrics.target, null)

const missingBreakEvenInput = PerformanceService.getMetrics({ ...snapshot, breakEvenInputs: [] }, range)
assert.equal(missingBreakEvenInput.driverTargetAvailable, false)
assert.equal(missingBreakEvenInput.driverTarget, null)

console.log('KFE Performance contract tests: PASS')
