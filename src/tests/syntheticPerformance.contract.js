import assert from 'node:assert/strict'
import { buildSyntheticSnapshot } from '../application/synthetic/syntheticDataService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { istDayRange } from '../domain/time/ist.js'
import { normalizeCalculationSnapshot } from '../application/performance/normalizeCalculationSnapshot.js'

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
const normalized = normalizeCalculationSnapshot(calculationSnapshot)
assert.equal(normalized.driverTargets.length, 1)
const metrics = PerformanceService.getMetrics(calculationSnapshot, range)

assert.equal(snapshot.shifts.length, 1826)
assert.equal(snapshot.trips.length, 8951)
assert.equal(snapshot.driver_targets.length, 1)
assert.equal(metrics.operatingKmForecast.available, true)
assert.equal(metrics.operatingKmForecast.observedOperatingDays, 1826)
assert.ok(Math.abs(metrics.operatingKmForecast.calculatedForecast.dailyKm - 212.21168510607765) < 1e-6)
assert.ok(Math.abs(metrics.driverTargetOperatingKmMultiplier - 1.0610584255303882) < 1e-12)
assert.ok(Math.abs(metrics.operatingKmForecast.calculatedForecast.dailyKm - 212.21168510607765) < 1e-6)
assert.equal(metrics.driverTargetAvailable, true)

// Profit contract: actual profit is based only on authoritative revenue and
// actual operating expenses; indicative profit independently subtracts the
// provisions allocated to the selected period, including the loan provision.
const expectedActualProfit = metrics.revenue - metrics.actualOperatingCost
const expectedIndicativeProfit = metrics.revenue - metrics.totalIndicativeProvision
assert.ok(Number.isFinite(metrics.actualProfit))
assert.ok(Number.isFinite(metrics.indicativeProfit))
assert.ok(Math.abs(metrics.actualProfit - expectedActualProfit) < 1e-9)
assert.ok(Math.abs(metrics.indicativeProfit - expectedIndicativeProfit) < 1e-9)
assert.ok(Math.abs(metrics.totalIndicativeProvision - (
  metrics.loanProvisionForPeriod + metrics.maintenanceProvision + metrics.renewalProvision
)) < 1e-9)
assert.equal(metrics.authority.actualProfit, 'AUTHORITATIVE_REVENUE_MINUS_ACTUAL_OPERATING_EXPENSES')
assert.equal(metrics.authority.indicativeProfit, 'AUTHORITATIVE_REVENUE_MINUS_PERIOD_PROVISIONS')

console.log('Synthetic end-to-end Performance calculation contract: PASS')
