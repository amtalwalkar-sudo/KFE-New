import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { derivePhaseOnePerformanceOverview } from '../domain/performance/phaseOneOverview.js'

const range = { from: new Date('2026-10-26T00:00:00+05:30'), to: new Date('2026-10-26T23:59:59.999+05:30') }
const snapshot = {
  shifts: [{ id: 'today', shiftStartAt: '2026-10-26T08:00:00+05:30', shiftEndAt: '2026-10-26T18:00:00+05:30', revenue: 1250 }],
  trips: [
    { id: 'completed', shiftId: 'today', status: 'COMPLETED', tripStartAt: '2026-10-26T09:00:00+05:30', tripEndAt: '2026-10-26T09:30:00+05:30', revenue: 1000 },
    { id: 'cancel-fee', shiftId: 'today', status: 'CANCELLED', tripStartAt: '2026-10-26T10:00:00+05:30', cancelledAt: '2026-10-26T10:02:00+05:30', cancelledRevenue: 250 },
  ],
}
const metrics = { fuelCost: 300, fuelCostPerKm: 2.5, fuelCostPerKmSource: 'FULL_TANK_INTERVAL' }
const result = derivePhaseOnePerformanceOverview(snapshot, range, metrics)
assert.equal(result.completedRides, 1)
assert.equal(result.cancellationFees, 250)
const legacyCancelledFare = derivePhaseOnePerformanceOverview({ ...snapshot, trips: [...snapshot.trips, { id: 'legacy-cancel', shiftId: 'today', status: 'CANCELLED', revenue: 999 }] }, range, metrics)
assert.equal(legacyCancelledFare.cancellationFees, 250, 'a cancelled Trip with no cancellation fee must not fall back to its fare field')
assert.equal(legacyCancelledFare.fareIncome, 1000, 'missing cancellation fees remain zero and cannot be subtracted from recorded shift revenue')
assert.equal(result.recordedRevenue, 1250)
assert.equal(result.fareIncome, 1000)
assert.equal(result.fuelSpending, 300)
assert.equal(result.fuelCostPerKm, 2.5)
assert.equal(result.incomeAfterFuel, 950, 'income after fuel includes cancellation fees')
assert.equal(Object.hasOwn(result, 'revenueAuthority'), false, 'The basic Performance view model must not expose retired revenue-authority metadata.')
const noInterval = derivePhaseOnePerformanceOverview(snapshot, range, { fuelCost: 0, fuelCostPerKm: null, fuelCostPerKmSource: null })
assert.equal(noInterval.fuelCostPerKm, null, 'fuel cost/km is unavailable without a valid full-tank interval')
assert.throws(() => derivePhaseOnePerformanceOverview(snapshot, { from: new Date('2026-10-27'), to: new Date('2026-10-26') }, metrics), /invalid/i)

const service = readFileSync(new URL('../application/performance/phaseOnePerformanceService.js', import.meta.url), 'utf8')
const view = readFileSync(new URL('../views/PerformanceView.vue', import.meta.url), 'utf8')
assert.match(service, /PerformanceRepository\.getSnapshot\(\)/)
assert.match(service, /await WorkService\.ensureCanonicalReadModel\(\)/, 'Performance must reconcile native Android Work before reading IndexedDB projections.')
assert.ok(service.indexOf('await WorkService.ensureCanonicalReadModel()') < service.indexOf('PerformanceRepository.getSnapshot()'), 'Performance must not calculate from a stale IndexedDB snapshot before native reconciliation.')
assert.match(readFileSync(new URL('../application/work/workService.js', import.meta.url), 'utf8'), /async ensureCanonicalReadModel\(\) \{ await reconcileCanonicalReads\(\)/, 'Work application service must expose the single native canonical reconciliation use case.')
assert.match(service, /calculateFuelPeriodSummary/)
assert.doesNotMatch(service, /deriveCumulativeProvisionBalances|DriverTargetService|deriveOperatingKmForecast|deriveFinanceAwarePerformance|deriveFinancialFactModel/)
assert.doesNotMatch(view, /provisionBalances|amortization|break-even|forecast|driver target/i)
console.log('Basic Performance contract: PASS')

const performanceCss = readFileSync(new URL('../styles/performance.css', import.meta.url), 'utf8')
assert.match(view, /performance-metric-highlight/)
assert.match(view, /Income after fuel/)
assert.match(view, /Based on saved records/)
assert.doesNotMatch(view, /READ-ONLY SUMMARY|Your recorded rides, revenue and fuel performance/)
assert.ok(performanceCss.includes('performance-metric-highlight{grid-column:1/-1;'))
assert.match(performanceCss, /performance-screen-reader-only/)
