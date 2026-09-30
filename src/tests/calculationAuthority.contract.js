import assert from 'node:assert/strict'
import { normalizeCalculationSnapshot } from '../application/performance/normalizeCalculationSnapshot.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'
import { istDateKey, istMonthRange } from '../domain/time/ist.js'

const range = {
  from: new Date('2026-09-10T00:00:00+05:30'),
  to: new Date('2026-09-10T23:59:59.999+05:30'),
}

const canonical = {
  shifts: [{ id: 's1', shiftStartAt: '2026-09-10T08:00:00+05:30', shiftEndAt: '2026-09-10T18:00:00+05:30', startOdometer: 1000, endOdometer: 1200, toll: 100, parking: 50 }],
  trips: [{ id: 't1', status: 'COMPLETED', tripStartAt: '2026-09-10T09:00:00+05:30', tripEndAt: '2026-09-10T12:00:00+05:30', tripKm: 150, revenue: 2000 }],
  fuelLogs: [{ id: 'f1', capturedAt: '2026-09-10T18:00:00+05:30', amount: 2200, quantityKg: 10 }],
  maintenance: [{ id: 'm1', performedOn: '2026-09-10', cost: 300 }],
  compliance: [],
  loans: [{ id: 'l1', principal: 550000, annualInterestRate: 10, tenureMonths: 60, startDate: '2026-04-09T00:00:00+05:30', status: 'ACTIVE' }],
  loanPayments: [], prepayments: [],
  driverTargets: [{ id: 'dt1', effectiveFrom: '2026-09-01T00:00:00+05:30', effectiveUntil: '2026-09-30T23:59:59.999+05:30', desiredDriverProfit: 1000, active: true }],
  breakEvenInputs: [{ id: 'be1', effectiveFrom: '2026-09-01T00:00:00+05:30', maintenanceProvisionPerKm: 3, active: true }],
}

const variants = {
  ...canonical,
  trips: [{ id: 't1', status: 'COMPLETED', trip_start_at: '2026-09-10T09:00:00+05:30', trip_end_at: '2026-09-10T12:00:00+05:30', trip_km: 150, fare: 2000 }],
  fuelLogs: [{ id: 'f1', created_at: '2026-09-10T18:00:00+05:30', total_cost: 2200, kg: 10 }],
  maintenance: [{ id: 'm1', date: '2026-09-10', amount: 300 }],
  loans: [{ id: 'l1', principal: 550000, annual_rate_percent: 10, tenureYears: 5, start_date: '2026-04-09T00:00:00+05:30', status: 'ACTIVE' }],
  driverTargets: [{ id: 'dt1', effective_from: '2026-09-01T00:00:00+05:30', effective_until: '2026-09-30T23:59:59.999+05:30', desiredProfit: 1000, active: true }],
  breakEvenInputs: [{ id: 'be1', effective_from: '2026-09-01T00:00:00+05:30', maintenance_provision_per_km: 3, active: true }],
}

const normalized = normalizeCalculationSnapshot(variants)
assert.equal(normalized.trips[0].tripStartAt, variants.trips[0].trip_start_at)
assert.equal(normalized.trips[0].tripKm, 150)
assert.equal(normalized.trips[0].revenue, 2000)
assert.equal(normalized.fuelLogs[0].amount, 2200)
assert.equal(normalized.fuelLogs[0].quantityKg, 10)
assert.equal(normalized.maintenance[0].cost, 300)
assert.equal(normalized.loans[0].tenureMonths, 60)
assert.equal(normalized.loans[0].annualInterestRatePercent, 10)
assert.equal(normalized.driverTargets[0].desiredDriverProfit, 1000)
assert.equal(normalized.breakEvenInputs[0].maintenanceProvisionPerKm, 3)
assert.equal('trip_start_at' in normalized.trips[0], false)
assert.equal('fare' in normalized.trips[0], false)
assert.equal('created_at' in normalized.fuelLogs[0], false)
assert.equal('desiredProfit' in normalized.driverTargets[0], false)
assert.equal('tenureYears' in normalized.loans[0], false)

const canonicalMetrics = derivePerformance(canonical, range)
const variantMetrics = derivePerformance(normalized, range)
for (const key of ['revenue', 'vehicleKm', 'businessKm', 'deadKm', 'fuelCost', 'fuelQty', 'actualMaintenance', 'loanScheduledObligation']) {
  assert.equal(variantMetrics[key], canonicalMetrics[key], `normalized variant changed ${key}`)
}

assert.equal(variantMetrics.period.timeZone, 'Asia/Kolkata')
const serviceMetrics = PerformanceService.getMetrics(canonical, range)
assert.equal(serviceMetrics.breakEvenRevenue, serviceMetrics.monthlyBreakEvenRevenue)
assert.equal(serviceMetrics.breakEvenRevenue, null)
assert.equal(serviceMetrics.calculationEvidence.breakEven.status, 'INDICATIVE')
assert.ok(Number.isFinite(serviceMetrics.indicativeMonthlyBreakEvenRevenue), 'Indicative break-even candidate should remain visible')
assert.ok(Number.isNaN(canonicalMetrics.monthlyBreakEvenRevenue))

const metrics = serviceMetrics
assert.equal('projectedRevenue' in metrics, false)
assert.equal('targetGap' in metrics.pace, false)
assert.equal(metrics.pace.currentRevenuePerFinancialDay, metrics.revenuePerActiveDay)
assert.equal(metrics.pace.requiredRevenuePerFinancialDay, metrics.target)
assert.equal(metrics.driverTargetAvailable, false)
assert.equal(metrics.target, null)
assert.equal(metrics.calculationEvidence.target.status, 'UNAVAILABLE')
assert.ok(Number.isNaN(metrics.pace.paceVariance))

assert.equal(metrics.dailyBreakEvenRevenue, null)
assert.equal(metrics.dailyBreakEven.status, 'INDICATIVE')

const futureTrip = { id: 'future', status: 'COMPLETED', tripStartAt: '2026-09-11T09:00:00+05:30', tripEndAt: '2026-09-11T10:00:00+05:30', tripKm: 500, revenue: 99999 }
const boundedTarget = deriveRollingDriverTarget({
  trips: [...canonical.trips, futureTrip],
  shifts: canonical.shifts,
  driverTargets: canonical.driverTargets,
  from: range.from,
  to: range.to,
  applicableBreakEven: canonicalMetrics.monthlyBreakEvenRevenue,
})
const baseTarget = deriveRollingDriverTarget({
  trips: canonical.trips,
  shifts: canonical.shifts,
  driverTargets: canonical.driverTargets,
  from: range.from,
  to: range.to,
  applicableBreakEven: canonicalMetrics.monthlyBreakEvenRevenue,
})
assert.equal(boundedTarget.available, false)
assert.equal(baseTarget.available, false)
assert.equal(boundedTarget.reason, 'MISSING_AUTHORITATIVE_TARGET_INPUT')

assert.equal(istDateKey(new Date('2026-09-10T23:00:00Z')), '2026-09-11')
assert.equal(istDateKey(new Date('2026-09-10T17:59:59Z')), '2026-09-10')
const currentMonth = istMonthRange(new Date('2026-09-10T12:00:00Z'), new Date('2026-09-16T12:00:00Z'))
assert.equal(currentMonth.from.toISOString(), '2026-08-31T18:30:00.000Z')
assert.equal(currentMonth.to.toISOString(), '2026-09-10T18:29:59.999Z')

console.log('Calculation authority contract tests: PASS')
