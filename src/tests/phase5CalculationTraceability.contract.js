import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildSyntheticSnapshot } from '../application/synthetic/syntheticDataService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { istDayRange } from '../domain/time/ist.js'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const engine = read('../domain/performance/performanceEngineV2.js')
const adapter = read('../domain/performance/financePerformanceAdapter.js')
const service = read('../application/performance/performanceService.js')
const target = read('../domain/performance/driverTarget.js')
const facts = read('../domain/finance/financialFactModel.js')
const forecast = read('../domain/performance/operatingKmForecast.js')
const performanceView = read('../views/PerformanceView.vue')

assert.doesNotMatch(engine, /deriveAuthoritativeBreakEven|deriveLoanPosition|calculateEmi|scheduleWithPrepayments/)
assert.match(adapter, /deriveAuthoritativeBreakEven/)
assert.match(adapter, /deriveLoanPosition/)
assert.match(service, /deriveFinanceAwarePerformance/)
assert.match(service, /deriveOperatingKmForecast/)
assert.match(service, /deriveRollingDriverTarget/)
assert.match(service, /deriveFinancialFactModel/)
assert.match(target, /MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT/)
assert.match(facts, /SHIFT_END_REVENUE/)
assert.match(forecast, /calculatedForecast/)
assert.match(forecast, /effectiveForecast/)
assert.match(performanceView, /Actual P\/L = Financial Revenue − Actual Operating Expenses − Actual EMI\/loan payments/)
assert.match(performanceView, /Provisional P\/L = Actual P\/L − Maintenance Provision − Compliance Provision − Pre-business Loan Recovery − Historical Maintenance Recovery/)
assert.doesNotMatch(performanceView, /Provisional Profit \/ Loss = Authoritative Revenue/)

const snapshot = buildSyntheticSnapshot(1826, { fullTimeline: true })
const range = { from: istDayRange('2026-05-01T00:00:00+05:30').from, to: istDayRange('2031-04-30T00:00:00+05:30').to }
const calculationSnapshot = { ...snapshot, fuelLogs: snapshot.fuel_logs, compliance: snapshot.compliance_records, maintenance: snapshot.maintenance_records, loanPayments: snapshot.loan_payments, driverTargets: snapshot.driver_targets, breakEvenInputs: snapshot.break_even_inputs, settlements: [] }
const metrics = PerformanceService.getMetrics(calculationSnapshot, range)

assert.equal(snapshot.shifts.length, 1826)
assert.equal(snapshot.trips.length, 8951)
assert.equal(metrics.operatingKmForecast.available, true)
assert.equal(metrics.operatingKmForecast.observedOperatingDays, 1826)
assert.ok(Math.abs(metrics.operatingKmForecast.calculatedForecast.dailyKm - 212.21168510607765) < 1e-6)

assert.ok(Math.abs(metrics.actualProfit - (metrics.operatingProfit - metrics.performanceHeadlineScheduledEmi)) < 1e-9)
assert.ok(Math.abs(metrics.performanceHeadlineActualProfit - metrics.actualProfit) < 1e-9)
assert.ok(Math.abs(metrics.performanceHeadlineProvisionalProfit - (metrics.performanceHeadlineActualProfit - metrics.performanceHeadlineScheduledEmi - metrics.maintenanceProvision - metrics.renewalProvision - metrics.preBusinessRecoveryForPeriod - metrics.historicalMaintenanceRecoveryForPeriod)) < 1e-9)
assert.ok(Math.abs(metrics.indicativeProfit - metrics.performanceHeadlineProvisionalProfit) < 1e-9)
assert.ok(Math.abs(metrics.totalIndicativeProvision - (metrics.loanProvisionForPeriod + metrics.maintenanceProvision + metrics.renewalProvision)) < 1e-9)
assert.equal(metrics.authority.actualProfit, 'OPERATING_PROFIT_MINUS_FULL_SCHEDULED_EMI')
assert.equal(metrics.authority.indicativeProfit, 'PROVISIONAL_PROFIT_AFTER_SCHEDULED_EMI_AND_NORMALIZED_HISTORICAL_RECOVERY')
assert.equal(metrics.authority.breakEven, 'AUTHORITATIVE_MONTHLY_BREAK_EVEN')
assert.equal(metrics.dailyBreakEvenRevenue != null, true)
assert.equal(metrics.driverTargetAvailable, true)
assert.equal(metrics.calculationEvidence.target.status, 'AUTHORITATIVE')

const factsByType = new Map((metrics.financialFacts?.facts || []).map(fact => [fact.factType, fact]))
assert.equal(factsByType.get('REVENUE')?.sourceType, 'SHIFT_END_REVENUE')
assert.equal(factsByType.get('REVENUE')?.evidenceStatus, 'AUTHORITATIVE')
assert.equal(factsByType.get('FINANCING_OBLIGATION')?.sourceType, 'CANONICAL_LOAN_ENGINE')

console.log('Phase 5 calculation traceability contract: PASS')