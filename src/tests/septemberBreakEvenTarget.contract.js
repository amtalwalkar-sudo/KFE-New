import assert from 'node:assert/strict'
import { deriveFinanceAwarePerformance } from '../domain/performance/financePerformanceAdapter.js'
import { previousRange } from '../domain/performance/performanceEngineV2.js'
import { deriveAuthoritativeDriverTarget, getApplicableDriverTarget } from '../domain/performance/driverTarget.js'
import { deriveAuthoritativeBreakEven } from '../domain/performance/authoritativeBreakEven.js'
import { normalizeCalculationSnapshot } from '../application/performance/normalizeCalculationSnapshot.js'

const snapshot = normalizeCalculationSnapshot({
  shifts: [{ id: 's1', shiftStartAt: '2026-09-10T01:30:00.000Z', shiftEndAt: '2026-09-10T13:30:00.000Z', startOdometer: 70000, endOdometer: 70300, revenue: 5000, toll: 0, parking: 0 }],
  trips: [],
  fuelLogs: [
    // One fuel log is enough to establish an observed period fuel cost/km;
    // a second full-tank odometer reading is not yet available.
    { id: 'f1', capturedAt: '2026-09-10T13:30:00.000Z', odometer: 70300, amount: 2460, isFullTank: true, vehicleId: 'v1', quantityKg: 30, isFullTank: true, vehicleId: 'v1' },
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
assert.ok(Number.isFinite(metrics.monthlyBreakEvenRevenue), 'Partial setup must expose a provisional monthly break-even estimate')
assert.equal(metrics.breakEvenInputs.fuelCostPerKmSource, 'OBSERVED_PERIOD')
assert.equal(metrics.breakEvenInputs.fuelEvidence.status, 'INDICATIVE')
assert.ok(Number.isFinite(metrics.breakEvenInputs.maintenanceProvisionPerKm), 'Expected configured maintenance provision/km')

const targetRecord = getApplicableDriverTarget(snapshot.driverTargets, range.to)
const targetFromIndicativeBreakEven = deriveAuthoritativeDriverTarget({
  monthlyBreakEvenRevenue: metrics.monthlyBreakEvenRevenue,
  desiredDriverProfitMonthly: targetRecord?.desiredDriverProfit,
  calendarDays: 30,
})
assert.equal(targetFromIndicativeBreakEven.available, true, 'Indicative break-even must feed a provisional target so the figure updates before full-tank qualification')

const qualifiedSnapshot = normalizeCalculationSnapshot({
  ...snapshot,
  trips: [{ id: 't1', status: 'COMPLETED', tripStartAt: '2026-09-10T02:00:00.000Z', tripEndAt: '2026-09-10T10:00:00.000Z', tripKm: 300, revenue: 5000 }],
  fuelLogs: [
    { id: 'f0', capturedAt: '2026-09-09T13:30:00.000Z', odometer: 70000, amount: 2460, isFullTank: true, vehicleId: 'v1', quantityKg: 30, isFullTank: true, vehicleId: 'v1' },
    { id: 'f1', capturedAt: '2026-09-10T13:30:00.000Z', odometer: 70300, amount: 2460, isFullTank: true, vehicleId: 'v1', quantityKg: 30, isFullTank: true, vehicleId: 'v1' },
  ],
})
const qualifiedMetrics = deriveFinanceAwarePerformance(qualifiedSnapshot, range, previousRange(range))
assert.equal(qualifiedMetrics.completeness.breakEven, true)
assert.equal(qualifiedMetrics.calculationEvidence.breakEven.status, 'AUTHORITATIVE')
assert.ok(Number.isFinite(qualifiedMetrics.monthlyBreakEvenRevenue))
const qualifiedRecord = getApplicableDriverTarget(qualifiedSnapshot.driverTargets, range.to)
const qualifiedTarget = deriveAuthoritativeDriverTarget({
  monthlyBreakEvenRevenue: qualifiedMetrics.monthlyBreakEvenRevenue,
  desiredDriverProfitMonthly: qualifiedRecord?.desiredDriverProfit,
  calendarDays: 30,
})
assert.equal(qualifiedTarget.available, true)
assert.equal(qualifiedTarget.authority, 'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT')
assert.ok(Number.isFinite(qualifiedTarget.target))


const partialRange = { from: new Date('2026-09-01T00:00:00+05:30'), to: new Date('2026-09-30T23:59:59.999+05:30') }
const loanOnly = deriveAuthoritativeBreakEven({ range: partialRange, loanScheduledObligation: 12000, loanInputAvailable: true })
assert.equal(loanOnly.status, 'INDICATIVE')
assert.equal(loanOnly.indicativeMonthlyBreakEvenRevenue, 12000, 'Loan-only setup must produce a provisional break-even')

const complianceOnly = deriveAuthoritativeBreakEven({ range: partialRange, renewalProvision: 900, complianceInputAvailable: true })
assert.equal(complianceOnly.status, 'INDICATIVE')
assert.equal(complianceOnly.indicativeMonthlyBreakEvenRevenue, 900, 'Compliance-only setup must produce a provisional break-even')

const maintenanceOnly = deriveAuthoritativeBreakEven({
  range: partialRange,
  breakEvenInputs: [{ id: 'maintenance-only', effectiveFrom: '2026-01-01', maintenanceProvisionPerKm: 1.5, active: true }],
  vehicleKm: 1000,
  vehicleKmSource: 'TEST',
})
assert.equal(maintenanceOnly.status, 'INDICATIVE')
assert.equal(maintenanceOnly.indicativeMonthlyBreakEvenRevenue, 1500, 'Maintenance-only setup must produce a provisional break-even')

const fuelOnly = deriveAuthoritativeBreakEven({
  range: partialRange,
  fuelCostPerKm: 2,
  fuelCostPerKmStatus: 'INDICATIVE',
  vehicleKm: 1000,
  vehicleKmSource: 'TEST',
})
assert.equal(fuelOnly.status, 'INDICATIVE')
assert.equal(fuelOnly.indicativeMonthlyBreakEvenRevenue, 2000, 'Fuel-only setup must produce a provisional break-even')

console.log('September break-even → target dependency contract: PASS')
const midMonthStartSnapshot = normalizeCalculationSnapshot({
  businessSetup: { businessStartDate: '2026-09-15' },
  shifts: [
    { id: 'pre-business-shift', shiftStartAt: '2026-09-10T01:30:00.000Z', shiftEndAt: '2026-09-10T13:30:00.000Z', startOdometer: 70000, endOdometer: 70300, revenue: 1000 },
    { id: 'business-shift', shiftStartAt: '2026-09-16T01:30:00.000Z', shiftEndAt: '2026-09-16T13:30:00.000Z', startOdometer: 70300, endOdometer: 70400, revenue: 1000 },
  ],
  trips: [],
  fuelLogs: [{ id: 'mid-month-fuel', capturedAt: '2026-09-16T13:30:00.000Z', odometer: 70400, amount: 200, quantityKg: 10, isFullTank: false, vehicleId: 'v1' }],
  vehicles: [{ id: 'v1', acquiredOn: '2026-05-01' }], compliance: [], maintenance: [],
  loans: [], loanPayments: [], prepayments: [],
  driverTargets: [{ id: 'mid-month-target', effectiveFrom: '2026-05-01', effectiveUntil: '2026-12-31', desiredDriverProfit: 1000, active: true }],
  breakEvenInputs: [{ id: 'mid-month-be', effectiveFrom: '2026-05-01', effectiveUntil: '2026-12-31', maintenanceProvisionPerKm: 1.5, active: true }],
})
const midMonthRange = { from: new Date('2026-09-15T00:00:00+05:30'), to: new Date('2026-09-18T23:59:59.999+05:30') }
const midMonthMetrics = deriveFinanceAwarePerformance(midMonthStartSnapshot, midMonthRange, previousRange(midMonthRange))
assert.equal(midMonthMetrics.vehicleKm, 100, 'Reporting period vehicle KM starts at the configured business start date')
assert.equal(midMonthMetrics.breakEvenInputs.vehicleKmBasisSource, 'CALCULATED_OPERATING_KM_FORECAST')
assert.equal(Object.prototype.hasOwnProperty.call(midMonthMetrics.breakEvenInputs, 'expectedMonthlyVehicleKm'), false, 'Obsolete configured monthly KM must not survive into calculation outputs')
assert.equal(midMonthMetrics.indicative.monthlyBreakEvenRevenue,
  midMonthMetrics.breakEvenInputs.fixedCosts + midMonthMetrics.breakEvenInputs.vehicleKmBasis * (midMonthMetrics.breakEvenInputs.fuelCostPerKm + midMonthMetrics.breakEvenInputs.maintenanceProvisionPerKm),
  'Monthly break-even uses the frozen operating-KM forecast rather than selected-period vehicle KM')


const missingKmFuel = deriveAuthoritativeBreakEven({
  range: partialRange,
  fuelCostPerKm: 2,
  fuelCostPerKmStatus: 'INDICATIVE',
})
assert.equal(missingKmFuel.status, 'INDICATIVE')
assert.equal(missingKmFuel.trace.missingComponents.includes('vehicleKmForVariableCosts'), true,
  'A fuel rate without a KM basis must be marked missing, not priced as zero variable cost')
assert.equal(missingKmFuel.indicativeMonthlyBreakEvenRevenue, null,
  'A rate with no KM basis and no known cost subtotal must not fabricate a ₹0 estimate')

const expiredConfiguration = deriveAuthoritativeBreakEven({
  range: partialRange,
  breakEvenInputs: [{ id: 'expired', effectiveFrom: '2026-01-01', effectiveUntil: '2026-08-31', maintenanceProvisionPerKm: 9, active: true }],
  loanScheduledObligation: 1000,
  loanInputAvailable: true,
})
assert.equal(expiredConfiguration.maintenanceProvisionPerKm, null,
  'A break-even configuration past its effective-until date must not be selected')
