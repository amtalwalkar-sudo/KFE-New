import assert from 'node:assert/strict'
import { deriveFinanceAwarePerformance } from '../domain/performance/financePerformanceAdapter.js'
import { previousRange } from '../domain/performance/performanceEngineV2.js'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'
import { normalizeCalculationSnapshot } from '../application/performance/normalizeCalculationSnapshot.js'

const snapshot = normalizeCalculationSnapshot({
  shifts: [{ id: 's1', shiftStartAt: '2026-09-10T01:30:00.000Z', shiftEndAt: '2026-09-10T13:30:00.000Z', startOdometer: 70000, endOdometer: 70300, revenue: 5000, toll: 0, parking: 0 }],
  trips: [],
  fuelLogs: [
    // One fuel log is enough to establish an observed period fuel cost/km;
    // a second full-tank odometer reading is not yet available.
    { id: 'f1', capturedAt: '2026-09-10T13:30:00.000Z', odometer: 70300, amount: 2460, quantityKg: 30, isFullTank: true },
  ],
  vehicles: [{ id: 'v1', acquiredOn: '2026-05-01' }], drivers: [{ id: 'd1' }],
  compliance: [{ id: 'c1', validFrom: '2026-05-01', validUntil: '2027-04-30', cost: 25000, active: true }], maintenance: [],
  loans: [{ id: 'l1', principal: 550000, tenureMonths: 60, startDate: '2026-05-01', annualInterestRatePercent: 10, status: 'Active' }],
  loanPayments: [], prepayments: [],
  driverTargets: [{ id: 't1', driverId: 'd1', effectiveFrom: '2026-05-01', effectiveUntil: '2026-12-31', desiredDriverProfit: 1000, active: true }],
  breakEvenInputs: [{ id: 'be1', effectiveFrom: '2026-05-01', effectiveUntil: '2026-12-31', maintenanceProvisionPerKm: 1.6, active: true }],
})

const range = { from: new Date('2026-09-01T00:00:00+05:30'), to: new Date('2026-09-18T23:59:59.999+05:30') }
const metrics = deriveFinanceAwarePerformance(snapshot, range, previousRange(range))
assert.equal(metrics.completeness.breakEven, false, 'Provisional fuel evidence must not produce authoritative break-even: ' + JSON.stringify(metrics.breakEvenTrace))
assert.equal(metrics.calculationEvidence.breakEven.status, 'INDICATIVE')
assert.ok(Number.isFinite(metrics.indicative?.monthlyBreakEvenRevenue), 'Expected indicative monthly break-even candidate')
assert.equal(metrics.completeness.loan, true)
assert.ok(Number.isFinite(metrics.breakEvenInputs.fuelCostPerKm), 'Expected observed fuel cost/km fallback')
assert.equal(metrics.breakEvenInputs.fuelCostPerKmSource, 'OBSERVED_PERIOD')
assert.equal(metrics.breakEvenInputs.fuelEvidence.status, 'INDICATIVE')
assert.ok(Number.isFinite(metrics.breakEvenInputs.maintenanceProvisionPerKm), 'Expected configured maintenance provision/km')

const stabilization = deriveRollingDriverTarget({ shifts: snapshot.shifts, trips: snapshot.trips, driverTargets: snapshot.driverTargets, from: range.from, to: range.to, applicableBreakEven: metrics.monthlyBreakEvenRevenue })
assert.equal(stabilization.available, false, 'Indicative break-even must not feed authoritative target')
assert.equal(stabilization.reason, 'NO_FINANCIAL_DRIVER_TARGET_DAY')

const qualifiedSnapshot = normalizeCalculationSnapshot({
  ...snapshot,
  trips: [{ id: 't1', status: 'COMPLETED', tripStartAt: '2026-09-10T02:00:00.000Z', tripEndAt: '2026-09-10T10:00:00.000Z', tripKm: 300, revenue: 5000 }],
  fuelLogs: [
    { id: 'f0', capturedAt: '2026-09-09T13:30:00.000Z', odometer: 70000, amount: 2460, quantityKg: 30, isFullTank: true },
    { id: 'f1', capturedAt: '2026-09-10T13:30:00.000Z', odometer: 70300, amount: 2460, quantityKg: 30, isFullTank: true },
  ],
})
const qualifiedMetrics = deriveFinanceAwarePerformance(qualifiedSnapshot, range, previousRange(range))
assert.equal(qualifiedMetrics.completeness.breakEven, true)
assert.equal(qualifiedMetrics.calculationEvidence.breakEven.status, 'AUTHORITATIVE')
assert.ok(Number.isFinite(qualifiedMetrics.monthlyBreakEvenRevenue))
const qualifiedTarget = deriveRollingDriverTarget({
  shifts: qualifiedSnapshot.shifts,
  trips: qualifiedSnapshot.trips,
  driverTargets: qualifiedSnapshot.driverTargets,
  from: range.from,
  to: range.to,
  applicableBreakEven: qualifiedMetrics.monthlyBreakEvenRevenue,
})
assert.equal(qualifiedTarget.available, true)
assert.equal(qualifiedTarget.evidence.status, 'AUTHORITATIVE')
assert.ok(Number.isFinite(qualifiedTarget.currentDailyTarget))

console.log('September break-even → target dependency contract: PASS')