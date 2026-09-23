import assert from 'node:assert/strict'
import { buildSyntheticSnapshot } from '../application/synthetic/syntheticDataService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { istDayRange } from '../domain/time/ist.js'

const snapshot = buildSyntheticSnapshot(1826, { fullTimeline: true })
const range = {
  from: istDayRange('2026-05-01T00:00:00+05:30').from,
  to: istDayRange('2031-04-30T00:00:00+05:30').to,
}
const calculationSnapshot = {
  ...snapshot,
  fuelLogs: snapshot.fuel_logs,
  compliance: snapshot.compliance_records,
  maintenance: snapshot.maintenance_records,
  loanPayments: snapshot.loan_payments,
  driverTargets: snapshot.driver_targets,
  breakEvenInputs: snapshot.break_even_inputs,
  settlements: [],
}
const metrics = PerformanceService.getMetrics(calculationSnapshot, range)

assert.equal(snapshot.shifts.length, 1826)
assert.equal(snapshot.trips.length, 8951)
assert.equal(snapshot.settings[0].values.startDate, '2026-05-01')
assert.equal(snapshot.settings[0].values.endDate, '2031-04-30')
assert.equal(snapshot.settings[0].values.fullTimeline, true)
assert.equal(snapshot.driver_targets.length, 1)
assert.equal(snapshot.loan_payments.length, 0)
assert.equal(snapshot.prepayments.length, 0)
assert.equal(snapshot.shifts.at(-1).shiftEndAt.slice(0, 10), '2031-04-30')

assert.equal(metrics.operatingKmForecast.available, true)
assert.equal(metrics.operatingKmForecast.observedOperatingDays, 1826)
assert.ok(Math.abs(metrics.operatingKmForecast.calculatedForecast.dailyKm - 212.21168510607765) < 1e-6)
assert.ok(Math.abs(metrics.driverTargetOperatingKmMultiplier - 1.0610584255303882) < 1e-12)
assert.equal(metrics.driverTargetAvailable, true)
assert.ok(Number.isFinite(metrics.actualProfit))
assert.ok(Number.isFinite(metrics.indicativeProfit))
assert.ok(Math.abs(metrics.actualProfit - (metrics.revenue - metrics.actualOperatingCost)) < 1e-9)
assert.ok(Math.abs(metrics.indicativeProfit - (metrics.revenue - metrics.totalIndicativeProvision)) < 1e-9)

console.log('Phase 6 five-year synthetic calculation contract: PASS')
