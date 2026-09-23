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
const metrics = PerformanceService.getMetrics(snapshot, range)

assert.equal(snapshot.shifts.length, 1826)
assert.equal(snapshot.trips.length, 8951)
assert.equal(metrics.operatingKmForecast.available, true)
assert.equal(metrics.operatingKmForecast.observedOperatingDays, 1826)
assert.ok(Math.abs(metrics.operatingKmForecast.calculatedForecast.dailyKm - 212.21168510607765) < 1e-6)
assert.ok(Math.abs(metrics.driverTargetOperatingKmMultiplier - 1.0610584255303882) < 1e-12)

assert.ok(Math.abs(metrics.actualProfit - (metrics.revenue - metrics.actualOperatingCost)) < 1e-9)
assert.ok(Math.abs(metrics.indicativeProfit - (metrics.revenue - metrics.totalIndicativeProvision)) < 1e-9)
assert.ok(Math.abs(metrics.totalIndicativeProvision - (metrics.loanProvisionForPeriod + metrics.maintenanceProvision + metrics.renewalProvision)) < 1e-9)
assert.equal(metrics.authority.actualProfit, 'AUTHORITATIVE_REVENUE_MINUS_ACTUAL_OPERATING_EXPENSES')
assert.equal(metrics.authority.indicativeProfit, 'AUTHORITATIVE_REVENUE_MINUS_PERIOD_PROVISIONS')
assert.equal(metrics.authority.breakEven, 'AUTHORITATIVE_MONTHLY_BREAK_EVEN')
assert.equal(metrics.dailyBreakEven.source, 'AUTHORITATIVE_MONTHLY_BREAK_EVEN_ALLOCATED_OVER_REMAINING_ELIGIBLE_DAYS')
assert.equal(metrics.driverTargetAvailable, true)
assert.equal(metrics.calculationEvidence.target.status, 'AUTHORITATIVE')

const factsByType = new Map((metrics.financialFacts?.facts || []).map(fact => [fact.factType, fact]))
assert.equal(factsByType.get('REVENUE')?.sourceType, 'SHIFT_END_REVENUE')
assert.equal(factsByType.get('REVENUE')?.evidenceStatus, 'AUTHORITATIVE')
assert.equal(factsByType.get('FINANCING_PAYMENT')?.sourceType, 'LOAN_PAYMENTS_PLUS_APPLIED_PREPAYMENTS')

const future = { ...snapshot, shifts: [...snapshot.shifts, { id: 'phase5-future-shift', shiftStartAt: '2031-05-15T08:00:00+05:30', shiftEndAt: '2031-05-15T18:00:00+05:30', startOdometer: 999999, endOdometer: 1000999, revenue: 999999, toll: 0, parking: 0 }] }
const bounded = PerformanceService.getMetrics(future, range)
for (const key of ['revenue','vehicleKm','businessKm','deadKm','fuelCost','actualMaintenance','actualProfit','indicativeProfit','monthlyBreakEvenRevenue','driverTarget']) assert.equal(bounded[key], metrics[key], 'as-of leakage changed ' + key)

const noBreakEven = PerformanceService.getMetrics({ ...snapshot, break_even_inputs: [], breakEvenInputs: [] }, range)
assert.equal(noBreakEven.monthlyBreakEvenRevenue, null)
assert.equal(noBreakEven.driverTarget, null)
assert.equal(noBreakEven.driverTargetAvailable, false)

console.log('Phase 5 calculation traceability contract: PASS')