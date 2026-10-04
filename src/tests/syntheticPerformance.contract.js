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
assert.equal(metrics.driverTargetAvailable, true)

const expectedActualProfit = metrics.financialRevenue - metrics.actualOperatingCost - metrics.actualLoanPaid
const expectedIndicativeProfit = metrics.performanceHeadlineProvisionalProfit
assert.ok(Number.isFinite(metrics.actualProfit))
assert.ok(Number.isFinite(metrics.indicativeProfit))
assert.ok(Math.abs(metrics.actualProfit - expectedActualProfit) < 1e-9)
assert.ok(Math.abs(metrics.indicativeProfit - expectedIndicativeProfit) < 1e-9)
assert.ok(Math.abs(metrics.totalIndicativeProvision - (
  metrics.loanProvisionForPeriod + metrics.maintenanceProvision + metrics.renewalProvision
)) < 1e-9)
assert.equal(metrics.authority.actualProfit, 'OPERATING_PROFIT_MINUS_ACTUAL_LOAN_PAYMENTS')
assert.equal(metrics.authority.indicativeProfit, 'PROVISIONAL_PROFIT_AFTER_SCHEDULED_EMI_AND_NORMALIZED_HISTORICAL_RECOVERY')

console.log('Synthetic end-to-end Performance calculation contract: PASS')