import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PerformanceService } from '../application/performance/performanceService.js'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'
import { istMonthRange } from '../domain/time/ist.js'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const engineSource = read('../domain/performance/performanceEngineV2.js')
const serviceSource = read('../application/performance/performanceService.js')

assert.match(engineSource, /deriveAuthoritativeBreakEven/)
assert.match(serviceSource, /deriveRollingDriverTarget/)
assert.match(serviceSource, /derivePerformance\(/)
assert.match(serviceSource, /authoritativeMonthlyBreakEven/)
assert.match(serviceSource, /AUTHORITATIVE_MONTHLY_BREAK_EVEN/)
assert.doesNotMatch(serviceSource, /function\s+deriveAuthoritativeBreakEven/)
assert.doesNotMatch(serviceSource, /function\s+deriveRollingDriverTarget/)

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
  loans: [{ id:'loan1', principal:550000, annualInterestRate:10, tenureMonths:60, startDate:'2026-09-01' }],
  loanPayments: [],
  prepayments: [],
  compliance: [{ type:'insurance', validFrom:'2026-01-01', validUntil:'2026-12-31', cost:24000 }],
  breakEvenInputs: [{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:3, active:true }],
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:1000, active:true }],
}

const range = { from: new Date('2026-09-10T00:00:00Z'), to: new Date('2026-09-10T23:59:59Z') }
const previous = { from: new Date('2026-09-09T00:00:00Z'), to: new Date('2026-09-09T23:59:59Z') }
const engine = derivePerformance(snapshot, range, previous)
const service = PerformanceService.getMetrics(snapshot, range)

assert.equal(service.revenue, 1000)
assert.equal(service.vehicleKm, 200)
assert.equal(service.businessKm, 150)
assert.equal(service.deadKm, 50)
assert.equal(service.fuelCost, 2200)
assert.equal(service.toll, 100)
assert.equal(service.parking, 50)
assert.equal(service.actualMaintenance, 300)
assert.equal(service.runningCost, 2650)
assert.equal(service.operatingProfit, -1650)
assert.equal(service.breakEvenRevenue, service.monthlyBreakEvenRevenue)
assert.equal(service.target, service.driverTarget)
assert.ok(Number.isFinite(service.breakEvenRevenue))
assert.ok(Number.isFinite(service.driverTarget))

// PerformanceEngineV2 is the integration consumer of the sole monthly
// break-even authority. Compare the service representation to that same
// authoritative engine result instead of recreating a competing boundary or
// duplicating the break-even input lineage in the Phase 5 contract.
assert.equal(engine.monthlyBreakEvenRevenue, service.monthlyBreakEvenRevenue)

// Reproduce the exact calendar-month/as-of boundary supplied by PerformanceService.
const targetMonthRange = istMonthRange(range.to)
const stabilizationFrom = targetMonthRange?.from || range.from
const stabilizationTo = targetMonthRange
  ? new Date(Math.min(targetMonthRange.to.getTime(), range.to.getTime()))
  : range.to
const target = deriveRollingDriverTarget({
  trips: snapshot.trips,
  shifts: snapshot.shifts,
  driverTargets: snapshot.driverTargets,
  from: stabilizationFrom,
  to: stabilizationTo,
  applicableBreakEven: service.monthlyBreakEvenRevenue,
  historicalBreakEvenForDay: ({ day }) => {
    const monthRange = istMonthRange(day)
    assert.ok(monthRange)
    return service.monthlyBreakEvenRevenue
  },
})
assert.equal(service.driverTarget, target.currentDailyTarget)
assert.equal(service.driverTargetRemainingEligibleDays, target.remainingEligibleDays)
assert.equal(service.driverTargetAllocatedBeforeCurrentDay, target.targetAllocatedBeforeCurrentDay)
assert.equal(service.driverTargetRemainingObligation, target.remainingObligation)

const higherTargetInput = {
  ...snapshot,
  driverTargets: [{ ...snapshot.driverTargets[0], desiredDriverProfit:5000 }],
}
const higher = PerformanceService.getMetrics(higherTargetInput, range)
for (const key of ['revenue','vehicleKm','businessKm','deadKm','fuelCost','toll','parking','actualMaintenance','runningCost','operatingProfit','breakEvenRevenue','monthlyBreakEvenRevenue']) {
  assert.equal(higher[key], service[key], `Driver Target input changed actual metric: ${key}`)
}
assert.ok(higher.driverTarget > service.driverTarget)

const missingBreakEven = PerformanceService.getMetrics({ ...snapshot, breakEvenInputs: [] }, range)
assert.equal(missingBreakEven.breakEvenRevenue, null)
assert.equal(missingBreakEven.monthlyBreakEvenRevenue, null)
assert.equal(missingBreakEven.driverTarget, null)
assert.equal(missingBreakEven.driverTargetAvailable, false)

console.log('KFE Phase 5 Calculation & Performance contract tests: PASS')
