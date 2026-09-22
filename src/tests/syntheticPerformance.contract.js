import assert from 'node:assert/strict'
import { buildSyntheticSnapshot } from '../application/synthetic/syntheticDataService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { istDayRange } from '../domain/time/ist.js'

const snapshot = buildSyntheticSnapshot(1826, { fullTimeline: true })
const range = {
  from: istDayRange('2026-05-01T00:00:00+05:30').from,
  to: istDayRange('2031-04-30T00:00:00+05:30').to,
}
const metrics = PerformanceService.getMetrics(snapshot, range)

assert.equal(snapshot.shifts.length, 1826)
assert.equal(snapshot.trips.length, 8951)
assert.equal(snapshot.driver_targets.length, 60)
assert.equal(metrics.operatingKmForecast.available, true)
assert.equal(metrics.operatingKmForecast.observedOperatingDays, 1826)
assert.ok(Math.abs(metrics.operatingKmForecast.calculatedForecast.dailyKm - 212.21168510607765) < 1e-6)
console.log('Synthetic target multiplier:', metrics.driverTargetOperatingKmMultiplier, 'forecast:', metrics.operatingKmForecast?.calculatedForecast?.dailyKm, 'available:', metrics.driverTargetAvailable, 'reason:', metrics.driverTargetReason)
assert.ok(Math.abs(metrics.driverTargetOperatingKmMultiplier - 1.0610584255303882) < 1e-12)
assert.equal(metrics.driverTargetOperatingKmForecast, metrics.operatingKmForecast.calculatedForecast.dailyKm)
assert.equal(metrics.driverTargetAvailable, true)

console.log('Synthetic end-to-end Performance calculation contract: PASS')
