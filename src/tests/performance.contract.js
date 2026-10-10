import assert from 'node:assert/strict'
import { PerformanceService } from '../application/performance/performanceService.js'
import { derivePerformance, previousRange } from '../domain/performance/performanceEngineV2.js'
import { deriveFinanceAwarePerformance } from '../domain/performance/financePerformanceAdapter.js'

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10, `${message || 'values differ'}: ${actual} !== ${expected}`)

const snapshot = {
  trips: [{ id:'t1', status:'COMPLETED', tripStartAt:'2026-09-10T09:00:00Z', tripEndAt:'2026-09-10T12:00:00Z', tripKm:150, revenue:9999 }],
  shifts: [{ id:'s1', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1000, endOdometer:1200, toll:100, parking:50, revenue:1000 }],
  fuelLogs: [
    { capturedAt:'2026-09-04T18:00:00Z', odometer:600, quantityKg:10, amount:2000, isFullTank: true, vehicleId: 'v1' },
    { capturedAt:'2026-09-05T18:00:00Z', odometer:800, quantityKg:10, amount:2000, isFullTank: true, vehicleId: 'v1' },
    { capturedAt:'2026-09-06T18:00:00Z', odometer:1000, quantityKg:10, amount:2000, isFullTank: true, vehicleId: 'v1' },
    { capturedAt:'2026-09-10T18:00:00Z', odometer:1200, quantityKg:10, amount:2200, isFullTank: true, vehicleId: 'v1' },
  ],
  maintenance: [{ performedOn:'2026-09-10', cost:300 }],
  loan: { id:'loan1', principal:550000, annualInterestRate:10, tenureYears:5, startDate:'2026-09-01' },
  renewals: [{ id:'c1', type:'insurance', validFrom:'2026-01-01', validUntil:'2026-12-31', cost:24000 }],
  breakEvenInputs: [{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:3, active:true }],
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:1000, active:true }],
}

const engineSnapshot = { ...snapshot, loans: [{ ...snapshot.loan, annualInterestRatePercent: snapshot.loan.annualInterestRate, tenureMonths: snapshot.loan.tenureYears * 12 }], compliance: snapshot.renewals }
const range = { from: new Date('2026-09-10T00:00:00+05:30'), to: new Date('2026-09-10T23:59:59+05:30') }
const m = derivePerformance(engineSnapshot, range, previousRange(range))
const serviceMetrics = PerformanceService.getMetrics(snapshot, range)

assert.equal(m.revenue, 1000)
assert.equal(serviceMetrics.revenue, 1000)
assert.equal(serviceMetrics.revenue, snapshot.shifts[0].revenue)
assert.notEqual(serviceMetrics.revenue, snapshot.trips[0].revenue)
assert.equal(serviceMetrics.authority.revenue, 'SHIFT_END_REVENUE')

const independentExpenseMetrics = derivePerformance({
  shifts: [{
    id: 'mixed-expense-shift',
    shiftStartAt: '2026-09-10T08:00:00+05:30',
    shiftEndAt: '2026-09-10T18:00:00+05:30',
    startOdometer: 1000, endOdometer: 1100, revenue: 500,
    toll: 5, parking: 2, tollTreatment: 'INCLUDED', parkingTreatment: 'EXCLUDED',
    tollParkingRevenueTreatment: 'INCLUDED', tollParkingCaptureMode: 'ADDITIONAL_ONLY'
  }],
  trips: [{
    id: 'mixed-expense-trip', shiftId: 'mixed-expense-shift', status: 'COMPLETED',
    tripStartAt: '2026-09-10T09:00:00+05:30', tripEndAt: '2026-09-10T12:00:00+05:30',
    tripKm: 100, revenue: 500, toll: 20, parking: 10,
    tollTreatment: 'INCLUDED', parkingTreatment: 'EXCLUDED'
  }],
  fuelLogs: [], maintenance: [], compliance: [], breakEvenInputs: []
}, range)
assert.equal(independentExpenseMetrics.revenue, 500, 'Shift-end customer-paid revenue remains authoritative')
assert.equal(independentExpenseMetrics.financialRevenue, 475, 'Included trip and shift toll reduce financial revenue once')
assert.equal(independentExpenseMetrics.toll, 25, 'Trip and additional shift toll are both included in expense facts')
assert.equal(independentExpenseMetrics.parking, 12, 'Trip and additional shift parking are both included in expense facts')
assert.equal(independentExpenseMetrics.passThroughToll, 25)
assert.equal(independentExpenseMetrics.passThroughParking, 0)
assert.equal(independentExpenseMetrics.excludedTollExpense, 0)
assert.equal(independentExpenseMetrics.excludedParkingExpense, 12)
assert.equal(independentExpenseMetrics.actualOperatingCost, 12, 'Only excluded parking is deducted as operating expense')
assert.equal(independentExpenseMetrics.operatingProfit, 463, 'Mixed treatment must not double-count included toll')

const legacyAggregateMetrics = derivePerformance({
  shifts: [{
    id: 'legacy-aggregate-shift',
    shiftStartAt: '2026-09-10T08:00:00+05:30',
    shiftEndAt: '2026-09-10T18:00:00+05:30',
    startOdometer: 1000, endOdometer: 1100, revenue: 500,
    toll: 50, parking: 25, tollParkingRevenueTreatment: 'INCLUDED'
  }],
  trips: [{
    id: 'legacy-aggregate-trip', shiftId: 'legacy-aggregate-shift', status: 'COMPLETED',
    tripStartAt: '2026-09-10T09:00:00+05:30', tripEndAt: '2026-09-10T12:00:00+05:30',
    tripKm: 100, revenue: 500, toll: 50, parking: 25
  }],
  fuelLogs: [], maintenance: [], compliance: [], breakEvenInputs: []
}, range)
assert.equal(legacyAggregateMetrics.financialRevenue, 425, 'Legacy shift aggregates must not double-count trip expenses')
assert.equal(legacyAggregateMetrics.toll, 50)
assert.equal(legacyAggregateMetrics.parking, 25)
assert.equal(legacyAggregateMetrics.operatingProfit, 425)
const overEstimateMetrics = derivePerformance({
  shifts: [{ id: 'over-shift', shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T18:00:00Z', startOdometer: 1000, endOdometer: 1200, revenue: 1000 }],
  trips: [{ id: 'over-trip', status: 'COMPLETED', tripStartAt: '2026-09-10T09:00:00Z', tripEndAt: '2026-09-10T12:00:00Z', tripKm: 250 }],
  fuelLogs: [], maintenance: [], compliance: [], breakEvenInputs: [],
}, range)
assert.equal(overEstimateMetrics.deadKmIntegrityStatus, 'OVER_ESTIMATE', 'Business KM above odometer KM is an integrity exception, not negative dead KM')
assert.ok(Number.isNaN(overEstimateMetrics.deadKm), 'Invalid negative dead KM must remain unavailable rather than a negative value')
const missingTripKmMetrics = derivePerformance({
  shifts: [{ id: 'missing-km-shift', shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T18:00:00Z', startOdometer: 1000, endOdometer: 1200, revenue: 1000 }],
  trips: [{ id: 'missing-km-trip', status: 'COMPLETED', tripStartAt: '2026-09-10T09:00:00Z', tripEndAt: '2026-09-10T12:00:00Z', tripKm: null }],
  fuelLogs: [], maintenance: [], compliance: [], breakEvenInputs: [],
}, range)
assert.equal(missingTripKmMetrics.businessKmIntegrityStatus, 'MISSING_TRIP_KM')
assert.ok(Number.isNaN(missingTripKmMetrics.businessKm))
assert.equal(missingTripKmMetrics.deadKmIntegrityStatus, 'MISSING_BUSINESS_KM')
assert.ok(Number.isNaN(missingTripKmMetrics.deadKm))
near(serviceMetrics.indicativeProfit, serviceMetrics.performanceHeadlineProvisionalProfit, 'loss recovery uses full provisional profit economics')
assert.equal(serviceMetrics.openingPersonalKm, 0, 'Opening personal allocation is a separate mileage bucket')
assert.equal(serviceMetrics.openingDeadKm, 0, 'Opening dead allocation is a separate mileage bucket')
const openingGapMetrics = derivePerformance({
  shifts: [{ id: 'gap-shift', shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T18:00:00Z', startOdometer: 65000, endOdometer: 65200, openingPersonalKm: 1000, openingDeadKm: 0, revenue: 1000 }],
  trips: [], fuelLogs: [], maintenance: [], compliance: [], breakEvenInputs: [],
}, range)
assert.equal(openingGapMetrics.vehicleKm, 200, 'Opening gap must not inflate current-shift vehicle movement')
assert.equal(openingGapMetrics.openingPersonalKm, 1000, 'Opening gap allocation remains separately visible')
assert.equal(openingGapMetrics.openingDeadKm, 0)


assert.equal(serviceMetrics.driverTargetAvailable, true)
assert.equal(serviceMetrics.driverTarget, serviceMetrics.target)
assert.equal(serviceMetrics.completeness.target, true)
assert.ok(Number.isFinite(serviceMetrics.breakEvenRevenue))
assert.equal(serviceMetrics.breakEvenRevenue, serviceMetrics.monthlyBreakEvenRevenue)
assert.ok(Number.isFinite(serviceMetrics.monthlyBreakEvenRevenue))
assert.equal(serviceMetrics.driverTargetCalendarDaysInMonth, 30)
near(serviceMetrics.dailyBreakEvenRevenue, serviceMetrics.monthlyBreakEvenRevenue / 30, 'financial daily BE uses calendar days in target month')
near(serviceMetrics.driverTarget, serviceMetrics.driverTargetEffectiveMonthlyTarget / 30, 'driver target uses calendar days')

const manualDailyTargetInput = { ...snapshot, driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:1000, dailyTarget:1, targetPerActiveDay:2, active:true }] }
const manualDailyTargetMetrics = PerformanceService.getMetrics(manualDailyTargetInput, range)
assert.equal(manualDailyTargetMetrics.driverTargetAvailable, true)
near(manualDailyTargetMetrics.target, serviceMetrics.driverTarget, 'manual daily target must be ignored')

const higherProfitTargetMetrics = PerformanceService.getMetrics({
  ...snapshot,
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:5000, active:true }],
}, range)
for (const key of [
  'revenue', 'vehicleKm', 'businessKm', 'deadKm', 'fuelCost', 'fuelQty', 'toll', 'parking',
  'actualMaintenance', 'workingHours', 'runningCost', 'loanScheduledObligation', 'actualLoanPaid',
  'actualPrepayment', 'actualFinancingOutflow', 'renewalProvision', 'operatingProfit',
  'provisionAdjustedProfit', 'availableCash', 'breakEvenRevenue', 'monthlyBreakEvenRevenue',
  'dailyBreakEvenRevenue',
]) assert.equal(higherProfitTargetMetrics[key], serviceMetrics[key], `target input changed actual metric: ${key}`)
assert.ok(higherProfitTargetMetrics.driverTarget > serviceMetrics.driverTarget, 'higher desired driver profit raises the authoritative daily target')

const changedInput = { ...snapshot, breakEvenInputs: [{ effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:4, active:true }] }
const changedEngineSnapshot = { ...engineSnapshot, breakEvenInputs: changedInput.breakEvenInputs }
const changedEngineMetrics = derivePerformance(changedEngineSnapshot, range, previousRange(range))
const changedEngineFinance = deriveFinanceAwarePerformance(changedEngineSnapshot, range, previousRange(range))
const changedServiceMetrics = PerformanceService.getMetrics(changedInput, range)
near(changedServiceMetrics.breakEvenRevenue - serviceMetrics.breakEvenRevenue, 4200, 'service BE change uses normalized monthly KM basis')
near(changedEngineFinance.monthlyBreakEvenRevenue, changedServiceMetrics.breakEvenRevenue, 'finance adapter BE authority')
near(changedServiceMetrics.monthlyBreakEvenRevenue - serviceMetrics.monthlyBreakEvenRevenue, 4200, 'monthly BE change uses normalized monthly KM basis')
near(changedServiceMetrics.dailyBreakEvenRevenue - serviceMetrics.dailyBreakEvenRevenue, 4200 / 30, 'daily BE change uses normalized monthly KM basis')

const missingMaintenanceInput = { ...snapshot, breakEvenInputs: [{ effectiveFrom:'2026-09-01', active:true }] }
const missingEngineSnapshot = { ...engineSnapshot, breakEvenInputs: missingMaintenanceInput.breakEvenInputs }
const missingEngineMetrics = derivePerformance(missingEngineSnapshot, range, previousRange(range))
const missingServiceMetrics = PerformanceService.getMetrics(missingMaintenanceInput, range)
assert.equal(missingEngineMetrics.completeness.breakEven, false)
assert.ok(Number.isNaN(missingEngineMetrics.monthlyBreakEvenRevenue))
assert.equal(missingServiceMetrics.completeness.breakEven, false)

const missingBreakEvenInput = PerformanceService.getMetrics({ ...snapshot, breakEvenInputs: [] }, range)
assert.ok(Number.isFinite(missingBreakEvenInput.monthlyBreakEvenRevenue), 'Other available components must not be blocked by a missing maintenance rate')

const shiftStartedNoCompletedTrip = { ...snapshot, trips: [], shifts: [{ ...snapshot.shifts[0], shiftEndAt: null, revenue: 0 }] }
const shiftStartedMetrics = PerformanceService.getMetrics(shiftStartedNoCompletedTrip, range)
assert.equal(shiftStartedMetrics.driverTargetAvailable, true, 'Target is available before the first trip when authoritative inputs exist')
assert.ok(Number.isFinite(shiftStartedMetrics.target))

const noLoanSnapshot = { ...snapshot, loan: null, loans: [] }
const noLoanMetrics = PerformanceService.getMetrics(noLoanSnapshot, range)
assert.equal(noLoanMetrics.completeness.loan, false)
assert.equal(noLoanMetrics.finance.available, false)
assert.equal(noLoanMetrics.finance.reason, 'NO_ACTIVE_LOAN')
assert.equal(noLoanMetrics.loanScheduledObligation, 0)
assert.equal(noLoanMetrics.actualLoanPaid, 0)
assert.equal(noLoanMetrics.actualPrepayment, 0)
assert.equal(noLoanMetrics.actualFinancingOutflow, 0)
assert.ok(Number.isFinite(noLoanMetrics.monthlyBreakEvenRevenue), JSON.stringify(noLoanMetrics))
assert.equal(noLoanMetrics.breakEvenRevenue, noLoanMetrics.monthlyBreakEvenRevenue)

const provisionSnapshot = {
  ...engineSnapshot,
  settlements: [
    { id:'maintenance-pay', sourceType:'Maintenance', sourceId:'m1', settlementType:'Payment', direction:'OUT', settledOn:'2026-09-10T10:00:00Z', amount:700 },
    { id:'compliance-pay', sourceType:'Compliance', sourceId:'c1', settlementType:'Payment', direction:'OUT', settledOn:'2026-09-10T10:00:00Z', amount:25000 },
  ],
}
const provisionMetrics = derivePerformance(provisionSnapshot, range, previousRange(range))
near(provisionMetrics.maintenanceProvision, 600, 'maintenance provision must use applicable KM x rate')
near(provisionMetrics.maintenanceProvisionBalance, -100, 'maintenance provision pool must allow negative balances')
near(provisionMetrics.complianceProvisionById.c1, 24000 / 365, 'compliance provision must accrue across every calendar day in the validity/report overlap')
near(provisionMetrics.complianceProvisionAccumulatedById.c1, (24000 / 365) * 253, 'compliance provision bucket must accumulate through the selected as-of date')
near(provisionMetrics.complianceProvisionBalancesById.c1, ((24000 / 365) * 253) - 25000, 'compliance provision bucket must reduce by actual payment')

// Provision buckets are rolling balances, not month-local buckets.
// A prior month's provision/payment changes the opening balance of the next month.
const rolloverSnapshot = {
  ...engineSnapshot,
  shifts: [
    { id:'aug', shiftStartAt:'2026-08-15T08:00:00Z', shiftEndAt:'2026-08-15T18:00:00Z', startOdometer:1000, endOdometer:1100, toll:0, parking:0, revenue:1000 },
    { id:'sep', shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T18:00:00Z', startOdometer:1100, endOdometer:1300, toll:0, parking:0, revenue:1000 },
  ],
  settlements: [
    { id:'aug-maint-pay', sourceType:'Maintenance', sourceId:'m1', settlementType:'Payment', direction:'OUT', settledOn:'2026-08-31T10:00:00Z', amount:300 },
    { id:'sep-maint-pay', sourceType:'Maintenance', sourceId:'m2', settlementType:'Payment', direction:'OUT', settledOn:'2026-09-10T10:00:00Z', amount:600 },
  ],
  compliance: [{ id:'c-roll', validFrom:'2026-08-01', validUntil:'2026-09-30', cost:6100 }],
  breakEvenInputs: [{ effectiveFrom:'2026-08-01', maintenanceProvisionPerKm:3, active:true }],
}
const augRange = { from:new Date('2026-08-01T00:00:00Z'), to:new Date('2026-08-31T23:59:59Z') }
const sepRange = { from:new Date('2026-09-01T00:00:00Z'), to:new Date('2026-09-30T23:59:59Z') }
const augProvision = derivePerformance(rolloverSnapshot, augRange, previousRange(augRange))
const sepProvision = derivePerformance(rolloverSnapshot, sepRange, previousRange(sepRange))
near(augProvision.maintenanceProvisionAccumulated, 300, 'August maintenance provision must accumulate')
near(augProvision.maintenanceProvisionBalance, 0, 'August maintenance payment must empty the maintenance bucket')
near(sepProvision.maintenanceProvisionAccumulated, 900, 'September maintenance bucket must include the prior month')
near(sepProvision.maintenanceProvisionBalance, 0, 'September maintenance payment must empty the rolled maintenance bucket')
near(sepProvision.complianceProvisionAccumulatedById['c-roll'], 6100, 'September compliance bucket must roll from August through validity end')
near(sepProvision.complianceProvisionBalancesById['c-roll'], 6100, 'compliance bucket must carry unpaid provision forward across months')

const historicalRateSnapshot = {
  ...engineSnapshot,
  shifts: [
    { id:'aug-shift', shiftStartAt:'2026-08-05T08:00:00Z', shiftEndAt:'2026-08-05T18:00:00Z', startOdometer:600, endOdometer:800, toll:0, parking:0, revenue:1000 },
    ...engineSnapshot.shifts,
  ],
  breakEvenInputs: [
    { effectiveFrom:'2026-08-01', maintenanceProvisionPerKm:2, active:true },
    { effectiveFrom:'2026-09-01', maintenanceProvisionPerKm:4, active:true },
  ],
}
const historicalRateRange = { from:new Date('2026-08-01T00:00:00Z'), to:new Date('2026-09-10T23:59:59Z') }
const historicalRateMetrics = derivePerformance(historicalRateSnapshot, historicalRateRange, previousRange(historicalRateRange))
near(historicalRateMetrics.maintenanceProvision, 1200, 'maintenance provision must respect historical rate changes')

const timestampRateSnapshot = {
  ...snapshot,
  breakEvenInputs: [{ effectiveFrom:'2026-09-01T00:00:00.000Z', maintenanceProvisionPerKm:3, active:true }],
}
const timestampRateMetrics = derivePerformance(timestampRateSnapshot, range, previousRange(range))
near(timestampRateMetrics.maintenanceProvision, 600, 'maintenance provision must apply an ISO timestamp rate to every vehicle KM')

const performanceViewSource = (await import('node:fs')).readFileSync(new URL('../views/PerformanceView.vue', import.meta.url), 'utf8')
assert.match(performanceViewSource, /\['Scheduled EMI · planning',money\(m\.value\.performanceHeadlineScheduledEmi\)\]/)
assert.match(performanceViewSource, /\['Actual profit \/ loss',money\(actualProfit\.value\)\]/)

const noVehicleFuelSnapshot = {
  ...engineSnapshot,
  fuelLogs: [
    { capturedAt:'2026-09-04T18:00:00Z', odometer:600, quantityKg:10, amount:2000, isFullTank:true },
    { capturedAt:'2026-09-05T18:00:00Z', odometer:800, quantityKg:10, amount:2200, isFullTank:true },
  ],
}
const noVehicleFuelMetrics = derivePerformance(noVehicleFuelSnapshot, range, previousRange(range))
near(noVehicleFuelMetrics.fuelCostPerKm, 11, 'single-vehicle Work fuel logs without vehicleId must still form full-tank intervals')

const recoverySnapshot = {
  ...engineSnapshot,
  businessSetup: { businessStartDate:'2026-05-15' },
  vehicles: [{ id:'v1', active:true, status:'Active', openingOdometerKm:10000 }],
  loans: [{ id:'loan-pre', principal:120000, annualInterestRatePercent:0, tenureMonths:12, startDate:'2026-04-15', status:'Active' }],
  loanPayments: [],
  prepayments: [],
}
const oneDayRecoveryRange = { from:new Date('2026-05-15T00:00:00+05:30'), to:new Date('2026-05-15T23:59:59+05:30') }
const recoveryMetrics = deriveFinanceAwarePerformance(recoverySnapshot, oneDayRecoveryRange, previousRange(oneDayRecoveryRange))
assert.ok(recoveryMetrics.historicalMaintenanceRecoveryForPeriod > 0 && recoveryMetrics.historicalMaintenanceRecoveryForPeriod < recoveryMetrics.historicalMaintenanceRecoveryMonthly, 'historical maintenance recovery must be period-allocated')
assert.ok(recoveryMetrics.preBusinessRecoveryForPeriod > 0 && recoveryMetrics.preBusinessRecoveryForPeriod < recoveryMetrics.preBusinessRecoveryMonthly, 'pre-business loan recovery must be period-allocated')


console.log('KFE Performance contract tests: PASS')
