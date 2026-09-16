import assert from 'node:assert/strict'
import { PerformanceService } from '../application/performance/performanceService.js'
import { derivePerformance, previousRange } from '../domain/performance/performanceEngineV2.js'

const snapshot = {
  trips: [{ id:'t1', status:'COMPLETED', tripStartAt:'2026-09-10T09:00:00Z', tripEndAt:'2026-09-10T12:00:00Z', tripKm:150, revenue:1000 }],
  shifts: [{ id:'s1', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1000, endOdometer:1200, toll:100, parking:50 }],
  fuelLogs: [{ capturedAt:'2026-09-10T18:00:00Z', odometer:1200, quantityKg:10, amount:2200 }],
  maintenance: [{ performedOn:'2026-09-10', cost:300 }],
  loan: { principal:550000, annualInterestRate:10, tenureYears:5 },
  renewals: [{ type:'insurance', validFrom:'2026-01-01', validUntil:'2026-12-31', cost:24000 }],
  breakEvenInputs: [{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:3, active:true }],
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:1000, workingDays:2, active:true }],
}
const range = { from: new Date('2026-09-10T00:00:00Z'), to: new Date('2026-09-10T23:59:59Z') }
const m = derivePerformance(snapshot, range, previousRange(range))
const serviceMetrics = PerformanceService.getMetrics(snapshot, range)
assert.equal(serviceMetrics.driverTargetAvailable, true)
assert.equal(serviceMetrics.driverTarget, serviceMetrics.target)
assert.equal(serviceMetrics.driverTarget, serviceMetrics.driverTargetBase)
assert.equal(serviceMetrics.completeness.target, true)
assert.equal(serviceMetrics.breakEvenRevenue, m.breakEvenRevenue)

const manualDailyTargetInput = {
  ...snapshot,
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:2000, dailyTarget:1, targetPerActiveDay:2, active:true }],
}
const manualDailyTargetMetrics = PerformanceService.getMetrics(manualDailyTargetInput, range)
assert.equal(manualDailyTargetMetrics.driverTargetAvailable, true)
assert.equal(manualDailyTargetMetrics.target, serviceMetrics.driverTarget)

const historicalRange = { from: new Date('2026-09-10T00:00:00Z'), to: new Date('2026-09-10T23:59:59Z') }
const historicalBaseSnapshot = {
  ...snapshot,
  shifts: [
    { id:'historical', shiftStartAt:'2026-09-05T08:00:00Z', shiftEndAt:'2026-09-05T18:00:00Z', startOdometer:800, endOdometer:1000, toll:100, parking:50 },
    ...snapshot.shifts,
  ],
  trips: [
    { id:'historical', status:'COMPLETED', tripStartAt:'2026-09-05T09:00:00Z', tripEndAt:'2026-09-05T12:00:00Z', tripKm:150, revenue:0 },
    ...snapshot.trips,
  ],
}
const historicalDeficitMetrics = PerformanceService.getMetrics(historicalBaseSnapshot, historicalRange)
assert.ok(historicalDeficitMetrics.driverTargetAvailable, JSON.stringify(historicalDeficitMetrics))
assert.ok(Number.isFinite(historicalDeficitMetrics.driverTargetRollingBalance), JSON.stringify(historicalDeficitMetrics))
assert.ok(historicalDeficitMetrics.driverTarget > historicalDeficitMetrics.driverTargetBase, JSON.stringify(historicalDeficitMetrics))

const historicalSurplusSnapshot = {
  ...historicalBaseSnapshot,
  trips: [
    { id:'historical', status:'COMPLETED', tripStartAt:'2026-09-05T09:00:00Z', tripEndAt:'2026-09-05T12:00:00Z', tripKm:150, revenue:100000 },
    snapshot.trips[0],
  ],
}
const historicalSurplusMetrics = PerformanceService.getMetrics(historicalSurplusSnapshot, historicalRange)
assert.equal(historicalSurplusMetrics.driverTargetAvailable, true)
assert.ok(Number.isFinite(historicalSurplusMetrics.driverTargetRollingBalance))
assert.ok(historicalSurplusMetrics.driverTargetRollingBalance < 0)
assert.ok(historicalSurplusMetrics.driverTarget < historicalSurplusMetrics.driverTargetBase)

const changedInput = { ...snapshot, breakEvenInputs: [{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:4, active:true }] }
const changedEngineMetrics = derivePerformance(changedInput, range, previousRange(range))
const changedServiceMetrics = PerformanceService.getMetrics(changedInput, range)
assert.equal(changedEngineMetrics.breakEvenRevenue - m.breakEvenRevenue, 200)
assert.equal(changedServiceMetrics.breakEvenRevenue - serviceMetrics.breakEvenRevenue, 200)
assert.equal(changedEngineMetrics.breakEvenRevenue, changedServiceMetrics.breakEvenRevenue)

const missingMaintenanceInput = { ...snapshot, breakEvenInputs: [{ effectiveFrom:'2026-09-01', active:true }] }
const missingEngineMetrics = derivePerformance(missingMaintenanceInput, range, previousRange(range))
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
