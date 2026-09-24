import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildSyntheticSnapshot } from '../application/synthetic/syntheticDataService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { istDayRange } from '../domain/time/ist.js'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const engine = read('../domain/performance/performanceEngineV2.js')
const adapter = read('../domain/performance/financePerformanceAdapter.js')
const service = read('../application/performance/performanceService.js')
const target = read('../domain/performance/driverTargetStabilization.js')
const facts = read('../domain/finance/financialFactModel.js')
const forecast = read('../domain/performance/operatingKmForecast.js')

assert.doesNotMatch(engine, /deriveAuthoritativeBreakEven|deriveLoanPosition|calculateEmi|scheduleWithPrepayments/)
assert.match(adapter, /deriveAuthoritativeBreakEven/)
assert.match(adapter, /deriveLoanPosition/)
assert.match(service, /deriveFinanceAwarePerformance/)
assert.match(service, /deriveOperatingKmForecast/)
assert.match(service, /deriveRollingDriverTarget/)
assert.match(service, /deriveFinancialFactModel/)
assert.match(target, /AUTHORITATIVE_MONTHLY_BREAK_EVEN_PLUS_DESIRED_DRIVER_PROFIT_PLUS_FINALIZED_PRIOR_LOSS_RECOVERY/)
assert.match(facts, /SHIFT_END_REVENUE/)
assert.match(forecast, /calculatedForecast/)
assert.match(forecast, /effectiveForecast/)

const snapshot = buildSyntheticSnapshot(1826, { fullTimeline: true })
const range = { from: istDayRange('2026-05-01T00:00:00+05:30').from, to: istDayRange('2031-04-30T00:00:00+05:30').to }
const calculationSnapshot = { ...snapshot, fuelLogs: snapshot.fuel_logs, compliance: snapshot.compliance_records, maintenance: snapshot.maintenance_records, loanPayments: snapshot.loan_payments, driverTargets: snapshot.driver_targets, breakEvenInputs: snapshot.break_even_inputs, settlements: [] }
const metrics = PerformanceService.getMetrics(calculationSnapshot, range)

assert.equal(snapshot.shifts.length, 1826)
assert.equal(snapshot.trips.length, 8951)
assert.equal(metrics.operatingKmForecast.available, true)
assert.equal(metrics.operatingKmForecast.observedOperatingDays, 1826)
assert.ok(Math.abs(metrics.operatingKmForecast.calculatedForecast.dailyKm - 212.21168510607765) < 1e-6)
assert.ok(Math.abs(metrics.driverTargetOperatingKmMultiplier - 1.0610584255303882) < 1e-12)

assert.ok(Math.abs(metrics.actualProfit - (metrics.financialRevenue - metrics.actualOperatingCost)) < 1e-9)
assert.ok(Math.abs(metrics.indicativeProfit - (metrics.revenue - metrics.totalIndicativeProvision)) < 1e-9)
assert.ok(Math.abs(metrics.totalIndicativeProvision - (metrics.loanProvisionForPeriod + metrics.maintenanceProvision + metrics.renewalProvision)) < 1e-9)
assert.equal(metrics.authority.actualProfit, 'AUTHORITATIVE_REVENUE_MINUS_ACTUAL_OPERATING_EXPENSES')
assert.equal(metrics.authority.indicativeProfit, 'AUTHORITATIVE_REVENUE_MINUS_PERIOD_PROVISIONS')
assert.equal(metrics.authority.breakEven, 'AUTHORITATIVE_MONTHLY_BREAK_EVEN')
assert.equal(metrics.dailyBreakEvenRevenue != null, true)
assert.equal(metrics.driverTargetAvailable, true)
assert.equal(metrics.calculationEvidence.target.status, 'AUTHORITATIVE')

const factsByType = new Map((metrics.financialFacts?.facts || []).map(fact => [fact.factType, fact]))
assert.equal(factsByType.get('REVENUE')?.sourceType, 'SHIFT_END_REVENUE')
assert.equal(factsByType.get('REVENUE')?.evidenceStatus, 'AUTHORITATIVE')
assert.equal(factsByType.get('FINANCING_OBLIGATION')?.sourceType, 'CANONICAL_LOAN_ENGINE')


console.log('Phase 5 calculation traceability contract: PASS')