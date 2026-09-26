import assert from 'node:assert/strict'
import { PerformanceService } from '../application/performance/performanceService.js'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'
import { generateUUID } from '../utils/uuid.js'

const range = { from: new Date('2026-09-10T00:00:00Z'), to: new Date('2026-09-10T23:59:59Z') }
const base = {
  shifts: [{ id:'s1', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1000, endOdometer:1200, toll:100, parking:50 }],
  trips: [{ id:'t1', status:'COMPLETED', tripStartAt:'2026-09-10T09:00:00Z', tripEndAt:'2026-09-10T10:00:00Z', tripKm:150, revenue:2000 }],
  fuelLogs: [
    { capturedAt:'2026-09-01T18:00:00Z', odometer:800, quantityKg:10, amount:2000, isFullTank: true, vehicleId: 'v1' },
    { capturedAt:'2026-09-05T18:00:00Z', odometer:1000, quantityKg:10, amount:2000, isFullTank: true, vehicleId: 'v1' },
    { capturedAt:'2026-09-10T18:00:00Z', odometer:1200, quantityKg:10, amount:2200, isFullTank: true, vehicleId: 'v1' },
  ],
  maintenance: [], compliance: [], loans: [
    { id:'loan1', principal:550000, annualInterestRate:10, tenureMonths:60, startDate:'2026-04-09', status:'Active' },
  ],
  loanPayments: [], prepayments: [],
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:500, workingDays:2 }],
  breakEvenInputs: [{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:2 }],
}

const empty = PerformanceService.getMetrics({}, range)
assert.equal(empty.driverTargetAvailable, false)
assert.equal(empty.driverTarget, null)
assert.equal(empty.completeness.breakEven, false)

// Future records must not leak into an earlier actual-performance period or its
// monthly break-even as-of boundary.
const historical = derivePerformance(base, range)
const historicalService = PerformanceService.getMetrics(base, range)
const futureFuel = { ...base, fuelLogs: [...base.fuelLogs, { capturedAt:'2026-09-11T18:00:00Z', odometer:1400, quantityKg:10, amount:10000, isFullTank: true, vehicleId: 'v1' }] }
const historicalWithFutureFuel = derivePerformance(futureFuel, range)
assert.equal(historicalWithFutureFuel.fuelCostPerKm, historical.fuelCostPerKm)
const historicalServiceWithFutureFuel = PerformanceService.getMetrics(futureFuel, range)
assert.equal(historicalServiceWithFutureFuel.monthlyBreakEvenRevenue, PerformanceService.getMetrics(base, range).monthlyBreakEvenRevenue)

const futureOperational = { ...base, trips: [...base.trips, { id:'future', status:'COMPLETED', tripStartAt:'2026-09-11T09:00:00Z', tripEndAt:'2026-09-11T10:00:00Z', tripKm:500, revenue:99999 }] }
const historicalWithFutureOperations = derivePerformance(futureOperational, range)
assert.equal(historicalWithFutureOperations.revenue, historical.revenue)
assert.equal(historicalWithFutureOperations.vehicleKm, historical.vehicleKm)

// Soft-deleted source records are excluded from actual calculations and financial-day classification.
const deletedTrip = { ...base.trips[0], deletedAt:'2026-09-10T20:00:00Z', deleted:true }
const withoutDeletedTrip = PerformanceService.getMetrics({ ...base, trips:[deletedTrip] }, range)
assert.equal(withoutDeletedTrip.revenue, 0)
assert.equal(withoutDeletedTrip.completeness.target, false)
assert.equal(withoutDeletedTrip.driverTargetAvailable, true)
assert.ok(Number.isFinite(withoutDeletedTrip.driverTarget))

// A started shift alone does not create a financial day, but an authoritative
// driver target remains available for the current calendar day before the first trip.
const holiday = PerformanceService.getMetrics({ ...base, trips:[] }, range)
assert.equal(holiday.driverTargetAvailable, true)
assert.ok(Number.isFinite(holiday.driverTarget))
assert.equal(holiday.counts.activeFinancialDays, 0)

// Financial-day target calculation uses the same dynamic remaining-eligible-day
// denominator for daily BE and Driver Target. Configured workingDays is ignored
// as a competing divisor.
const financialDay = PerformanceService.getMetrics(base, range)
assert.equal(financialDay.driverTargetAvailable, true)
assert.equal(financialDay.dailyBreakEvenRevenue, financialDay.monthlyBreakEvenRevenue / financialDay.driverTargetRemainingEligibleDays)
assert.equal(financialDay.driverTargetBase, financialDay.dailyBreakEvenRevenue + 500 / financialDay.driverTargetRemainingEligibleDays)

const workingDays2 = PerformanceService.getMetrics(base, range)
const workingDays20 = PerformanceService.getMetrics({ ...base, driverTargets:[{ ...base.driverTargets[0], workingDays:20 }] }, range)
assert.equal(workingDays2.driverTarget, workingDays20.driverTarget)

// A known holiday between financial days consumes no target allocation; the
// untouched monthly obligation is carried to the later eligible day.
const withLaterFinancialDay = {
  ...base,
  trips: [
    base.trips[0],
    { id:'later', status:'COMPLETED', tripStartAt:'2026-09-12T09:00:00Z', tripEndAt:'2026-09-12T10:00:00Z', tripKm:40, revenue:0 },
  ],
}
const later = PerformanceService.getMetrics(withLaterFinancialDay, { from:new Date('2026-09-10T00:00:00Z'), to:new Date('2026-09-12T23:59:59Z') })
assert.equal(later.driverTargetAvailable, true)
assert.ok(later.driverTarget > 0)
assert.equal(later.driverTargetEffectiveMonthlyTarget, later.monthlyBreakEvenRevenue + 500)

// Malformed loan data is treated as incomplete rather than throwing or fabricating a schedule.
const malformedLoan = PerformanceService.getMetrics({ ...base, loans:[{ principal:550000, annualInterestRate:10, tenureMonths:60 }] }, range)
assert.equal(malformedLoan.completeness.loan, false)
assert.equal(Number.isNaN(malformedLoan.loanScheduledObligation), true)
const blankTenureLoan = PerformanceService.getMetrics({ ...base, loans:[{ principal:550000, annualInterestRate:10, startDate:'2026-04-09', tenureMonths:'' }] }, range)
assert.equal(blankTenureLoan.completeness.loan, false)
assert.equal(Number.isNaN(blankTenureLoan.loanScheduledObligation), true)

const id1 = generateUUID(); const id2 = generateUUID()
assert.equal(typeof id1, 'string'); assert.equal(typeof id2, 'string'); assert.notEqual(id1, id2)

console.log('Calculation-boundary adversarial contract: PASS')
