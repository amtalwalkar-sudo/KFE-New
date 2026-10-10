import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PerformanceService } from '../application/performance/performanceService.js'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'
import { deriveAuthoritativeDriverTarget } from '../domain/performance/driverTarget.js'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'
import { deriveDailyTargetAchievement } from '../domain/performance/dailyTargetAchievement.js'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const engineSource = read('../domain/performance/performanceEngineV2.js')
const adapterSource = read('../domain/performance/financePerformanceAdapter.js')
const serviceSource = read('../application/performance/performanceService.js')

assert.doesNotMatch(engineSource, /deriveAuthoritativeBreakEven/)
assert.doesNotMatch(engineSource, /deriveLoanPosition|calculateEmi|scheduleWithPrepayments/)
assert.match(adapterSource, /deriveLoanPosition/)
assert.match(adapterSource, /deriveAuthoritativeBreakEven/)
assert.match(serviceSource, /deriveFinanceAwarePerformance\(/)
assert.doesNotMatch(serviceSource, /deriveAuthoritativeDriverTarget/)
assert.match(serviceSource, /AUTHORITATIVE_MONTHLY_BREAK_EVEN/)
assert.match(serviceSource, /deriveRollingDriverTarget/)

const snapshot = {
  trips: [{ id:'t1', status:'COMPLETED', tripStartAt:'2026-09-10T09:00:00Z', tripEndAt:'2026-09-10T12:00:00Z', tripKm:150, revenue:1 }],
  shifts: [{ id:'s1', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1000, endOdometer:1200, toll:100, parking:50, tollParkingRevenueTreatment:'EXCLUDED', tollParkingCaptureMode:'ADDITIONAL_ONLY', revenue:1000 }],
  fuelLogs: [
    { capturedAt:'2026-09-04T18:00:00Z', odometer:600, quantityKg:10, amount:2000, isFullTank:true, vehicleId:'v1' },
    { capturedAt:'2026-09-05T18:00:00Z', odometer:800, quantityKg:10, amount:2000, isFullTank:true, vehicleId:'v1' },
    { capturedAt:'2026-09-06T18:00:00Z', odometer:1000, quantityKg:10, amount:2000, isFullTank:true, vehicleId:'v1' },
    { capturedAt:'2026-09-10T18:00:00Z', odometer:1200, quantityKg:10, amount:2200, isFullTank:true, vehicleId:'v1' },
  ],
  maintenance:[{ performedOn:'2026-09-10', cost:300 }],
  loans:[{ id:'loan1', principal:550000, annualInterestRatePercent:10, tenureMonths:60, startDate:'2026-09-01' }],
  loanPayments:[], prepayments:[],
  compliance:[{ type:'insurance', validFrom:'2026-01-01', validUntil:'2026-12-31', cost:24000 }],
  breakEvenInputs:[{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:3, active:true }],
  driverTargets:[{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:1000, active:true }],
}
const range={from:new Date('2026-09-10T00:00:00Z'),to:new Date('2026-09-10T23:59:59Z')}
const previous={from:new Date('2026-09-09T00:00:00Z'),to:new Date('2026-09-09T23:59:59Z')}
const engine=derivePerformance(snapshot,range,previous)
const service=PerformanceService.getMetrics(snapshot,range)

assert.equal(service.revenue,1000)
assert.equal(service.vehicleKm,200)
assert.equal(service.businessKm,150)
assert.equal(service.deadKm,50)
assert.equal(service.fuelCost,2200)
assert.equal(service.toll,100)
assert.equal(service.parking,50)
assert.equal(service.actualMaintenance,300)
assert.equal(service.runningCost,2650)
assert.equal(service.operatingProfit,-1650)
assert.equal(service.breakEvenRevenue,service.monthlyBreakEvenRevenue)
assert.equal(service.target,service.driverTarget)
assert.ok(Number.isFinite(service.breakEvenRevenue))
assert.ok(Number.isFinite(service.driverTarget))

const stabilization = deriveRollingDriverTarget({
  trips: snapshot.trips,
  shifts: snapshot.shifts,
  driverTargets: snapshot.driverTargets,
  from: range.from,
  to: range.to,
  applicableBreakEven: service.monthlyBreakEvenRevenue,
})
assert.equal(service.driverTarget, stabilization.currentDailyTarget)
assert.equal(service.driverTargetBase, stabilization.currentBaseDaily)
assert.equal(service.driverTargetRollingBalance, stabilization.balance)
assert.equal(service.driverTargetAvailable, stabilization.available)
assert.equal(service.driverTargetAuthority, 'DRIVER_TARGET_ROLLING_RECOVERY')

const higher=PerformanceService.getMetrics({...snapshot,driverTargets:[{...snapshot.driverTargets[0],desiredDriverProfit:5000}]},range)
for(const key of ['revenue','vehicleKm','businessKm','deadKm','fuelCost','toll','parking','actualMaintenance','runningCost','operatingProfit','breakEvenRevenue','monthlyBreakEvenRevenue']) {
  assert.equal(higher[key],service[key],`Driver Target input changed actual metric: ${key}`)
}
assert.ok(higher.driverTarget>service.driverTarget)

const missing=PerformanceService.getMetrics({...snapshot,breakEvenInputs:[]},range)
assert.ok(Number.isFinite(missing.breakEvenRevenue), 'Available fuel/compliance data still produces a provisional estimate')
assert.equal(missing.calculationEvidence.breakEven.status, 'INDICATIVE')

// Regression: daily target achievement must never include a shift or trip
// completed later on the same IST day than the requested as-of timestamp.
{
  const snapshotAtMorning = {
    ...snapshot,
    shifts: [
      { ...snapshot.shifts[0], id: 'early', shiftEndAt: '2026-09-10T08:00:00Z', revenue: 1000 },
      { ...snapshot.shifts[0], id: 'future', shiftStartAt: '2026-09-10T14:00:00Z', shiftEndAt: '2026-09-10T18:00:00Z', revenue: 9000, status: 'COMPLETED' },
    ],
  }
  const dayRange = { from: new Date('2026-09-10T00:00:00Z'), to: new Date('2026-09-10T10:00:00Z') }
  const daily = deriveDailyTargetAchievement({
    shifts: snapshotAtMorning.shifts,
    trips: [],
    range: dayRange,
    asOf: new Date('2026-09-10T10:00:00Z'),
    completedShiftRevenue: 1000,
  })
  assert.equal(daily, 1000, 'Future same-day shift revenue must not enter the as-of target total.')
  assert.match(serviceSource, /reportedDayRange = reportingRangeFor\('DAY', asOf\)/)
  assert.match(serviceSource, /to: new Date\(Math\.min\(reportedDayRange\.to\.getTime\(\), new Date\(asOf\)\.getTime\(\)\)\)/)
}

// Regression: shift-level and trip-level toll/parking are both counted.
{
  const mixed = {
    ...snapshot,
    shifts: [{ ...snapshot.shifts[0], toll: 50, parking: 25, tollParkingRevenueTreatment: 'EXCLUDED', revenue: 1000 }],
    trips: [{ ...snapshot.trips[0], shiftId: 's1', toll: 100, parking: 75, revenue: 1 }],
  }
  const mixedMetrics = derivePerformance(mixed, range, previous)
  assert.equal(mixedMetrics.toll, 150)
  assert.equal(mixedMetrics.parking, 100)
  assert.equal(mixedMetrics.runningCost, 300 + 2200 + 150 + 100)
}

// Regression: fuel intervals must survive interleaved records from another vehicle.
{
  const { calculateRollingFuelCostPerKm } = await import('../domain/math/fuel.js')
  const fuel = calculateRollingFuelCostPerKm([
    { capturedAt: '2026-09-01T00:00:00Z', odometer: 1000, amount: 1000, isFullTank: true, vehicleId: 'A' },
    { capturedAt: '2026-09-02T00:00:00Z', odometer: 5000, amount: 5000, isFullTank: true, vehicleId: 'B' },
    { capturedAt: '2026-09-03T00:00:00Z', odometer: 1100, amount: 1200, isFullTank: true, vehicleId: 'A' },
  ])
  assert.equal(fuel.completedIntervals, 1)
  assert.equal(fuel.observations[0].vehicleId, 'A')
  assert.equal(fuel.observations[0].costPerKm, 12)
}

console.log('KFE Phase 5 Calculation & Performance contract tests: PASS')
