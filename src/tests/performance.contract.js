import assert from 'node:assert/strict'
import { derivePerformance, previousRange } from '../domain/performance/performanceEngineV2.js'
import { PerformanceService } from '../application/performance/performanceService.js'

const range = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-30T23:59:59Z') }
const snapshot = {
  shifts: [{ id:'s1', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1000, endOdometer:1200, toll:100, parking:50 }],
  trips: [{ id:'t1', status:'COMPLETED', tripStartAt:'2026-09-10T09:00:00Z', tripEndAt:'2026-09-10T12:00:00Z', tripKm:150, revenue:1000 }],
  fuelLogs: [
    { capturedAt:'2026-08-31T18:00:00Z', odometer:1000, quantityKg:20, amount:2000 },
    { capturedAt:'2026-09-10T18:00:00Z', odometer:1200, quantityKg:10, amount:2200 }
  ],
  maintenance: [{ performedOn:'2026-09-10', cost:300 }],
  compliance: [{ validFrom:'2026-01-01', validUntil:'2026-12-31', cost:12000 }],
  loans: [{ id:'loan1', principal:550000, annualInterestRate:10, tenureMonths:60, startDate:'2026-04-01', status:'Closed' }],
  loanPayments: [{ loanId:'loan1', paidOn:'2026-09-05', amount:12000, charges:100, status:'Paid' }],
  prepayments: [{ loanId:'loan1', paidOn:'2026-09-15', amount:5000, status:'Applied' }],
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:2000, active:true }],
  breakEvenInputs: [{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:3, active:true }]
}
const m = derivePerformance(snapshot, range, previousRange(range))
assert.equal(m.revenue, 1000)
assert.equal(m.vehicleKm, 200)
assert.equal(m.businessKm, 150)
assert.equal(m.deadKm, 50)
assert.equal(m.fuelCost, 2200)
assert.equal(m.fuelCostPerKm, 11)
assert.equal(m.actualMaintenance, 300)
assert.equal(m.runningCost, 2650)
assert.equal(m.operatingProfit, -1650)
assert.equal(m.actualLoanPaid, 12100)
assert.equal(m.actualPrepayment, 5000)
assert.equal(m.actualFinancingOutflow, 17100)
assert.equal(m.availableCash, -18750)
assert.equal(m.cashSurplusAfterFinancing, -18750)
assert.equal(m.provisionSetAside, m.provisionRequired)
assert.equal(m.provisionAdjustedProfit, m.operatingProfit - m.provisionRequired)
assert.equal(m.completeness.target, false)
assert.equal(m.target, null)
assert.equal(m.completeness.loan, true)
assert.equal(m.completeness.breakEven, true)
assert.ok(Number.isFinite(m.breakEvenRevenue))
assert.ok(Number.isFinite(m.loanScheduledObligation))
assert.ok(Number.isFinite(m.actualLoanPaid))
assert.equal(m.authority.deadKm, 'VEHICLE_KM_MINUS_BUSINESS_KM')
assert.equal(m.authority.breakEven, 'BREAK_EVEN_INPUTS_PLUS_CANONICAL_PERFORMANCE_COSTS')
assert.equal(m.breakEvenInputs.maintenanceProvisionPerKm, 3)

const serviceMetrics = PerformanceService.getMetrics(snapshot, range)
assert.ok(Number.isFinite(serviceMetrics.breakEvenRevenue))
assert.equal(serviceMetrics.breakEvenInputs.maintenanceProvisionPerKm, 3)
assert.equal(serviceMetrics.breakEvenRevenue, m.breakEvenRevenue)
assert.equal(serviceMetrics.authority.breakEven, 'BREAK_EVEN_INPUTS_PLUS_CANONICAL_PERFORMANCE_COSTS')
assert.ok(Number.isFinite(serviceMetrics.driverTarget))
assert.equal(serviceMetrics.driverTarget, (serviceMetrics.breakEvenRevenue + 2000) / 30)
assert.equal(serviceMetrics.target, serviceMetrics.driverTarget)
assert.equal(serviceMetrics.completeness.target, true)
assert.equal(serviceMetrics.authority.target, 'AUTHORITATIVE_DRIVER_TARGET_BREAK_EVEN_PLUS_DESIRED_PROFIT_PLUS_ROLLING_BALANCE')
assert.equal(serviceMetrics.pace.requiredRevenuePerActiveDay, serviceMetrics.driverTarget)

const manualDailyTargetInput = { ...snapshot, driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:2000, dailyTarget:1, targetPerActiveDay:2, active:true }] }
const manualDailyTargetMetrics = PerformanceService.getMetrics(manualDailyTargetInput, range)
assert.equal(manualDailyTargetMetrics.driverTargetAvailable, true)
assert.equal(manualDailyTargetMetrics.driverTarget, serviceMetrics.driverTarget)
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
assert.ok(historicalDeficitMetrics.driverTargetRollingBalance > 0, JSON.stringify(historicalDeficitMetrics))
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
assert.equal(missingBreakEvenInput.completeness.breakEven, false)
assert.equal(missingBreakEvenInput.driverTargetAvailable, false)
assert.equal(missingBreakEvenInput.driverTarget, null)
assert.equal(missingBreakEvenInput.target, null)

const missingTargetInput = PerformanceService.getMetrics({ ...snapshot, driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', targetRevenue:2000, active:true }] }, range)
assert.equal(missingTargetInput.driverTargetAvailable, false)
assert.equal(missingTargetInput.driverTarget, null)
assert.equal(missingTargetInput.target, null)

console.log('Performance contract passed: canonical sources, engine/service break-even parity, authoritative Driver Target display, historical rolling recovery/surplus reconstruction, no manual-target override, no maintenance fallback and financing/provision calculations are covered.')
