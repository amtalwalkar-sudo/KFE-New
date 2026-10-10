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

const inRange = value => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date >= range.from && date <= range.to
}
const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100
const expectedVehicleKm = snapshot.shifts.reduce((sum, shift) => sum + shift.endOdometer - shift.startOdometer, 0)
const expectedBusinessKm = snapshot.trips.reduce((sum, trip) => sum + Number(trip.tripKm), 0)
const expectedRevenue = snapshot.shifts.filter(shift => inRange(shift.shiftEndAt)).reduce((sum, shift) => sum + Number(shift.revenue || 0), 0)
const expectedFuelLogs = snapshot.fuel_logs.filter(log => inRange(log.capturedAt))
const expectedFuelCost = expectedFuelLogs.reduce((sum, log) => sum + Number(log.amount || 0), 0)
const expectedFuelQuantity = expectedFuelLogs.reduce((sum, log) => sum + Number(log.quantityKg || 0), 0)
const expectedMaintenance = snapshot.maintenance_records.filter(record => inRange(record.performedOn)).reduce((sum, record) => sum + Number(record.cost || 0), 0)
const expectedIncludedPassThrough = snapshot.shifts.filter(shift => inRange(shift.shiftEndAt) && shift.tollParkingRevenueTreatment === 'INCLUDED')
  .reduce((sum, shift) => sum + Number(shift.toll || 0) + Number(shift.parking || 0), 0)
const expectedExcludedTollParking = snapshot.shifts.filter(shift => inRange(shift.shiftEndAt) && shift.tollParkingRevenueTreatment === 'EXCLUDED')
  .reduce((sum, shift) => sum + Number(shift.toll || 0) + Number(shift.parking || 0), 0)
const expectedFinancialRevenue = expectedRevenue - expectedIncludedPassThrough
const expectedOperatingCost = expectedFuelCost + expectedMaintenance + expectedExcludedTollParking
const expectedMaintenanceProvision = roundMoney(expectedVehicleKm * 1.6)
const expectedComplianceAccrual = snapshot.compliance_records.reduce((sum, record) => sum + Number(record.cost || 0), 0)

assert.equal(metrics.vehicleKm, expectedVehicleKm, 'vehicle KM must reconcile to shift odometer deltas')
assert.equal(metrics.businessKm, expectedBusinessKm, 'business KM must reconcile to completed trip KM')
assert.equal(metrics.deadKm, expectedVehicleKm - expectedBusinessKm, 'dead KM must reconcile to vehicle KM less business KM')
assert.equal(metrics.businessKmIntegrityStatus, 'COMPLETE')
assert.equal(metrics.revenue, expectedRevenue, 'authoritative revenue must reconcile to shift-end revenue only')
assert.equal(metrics.financialRevenue, expectedFinancialRevenue, 'included toll/parking must be removed from financial revenue exactly once')
assert.equal(metrics.fuelCost, expectedFuelCost, 'fuel spend must reconcile to selected-period fuel logs')
assert.equal(metrics.fuelQty, expectedFuelQuantity, 'fuel quantity must reconcile to raw selected-period quantities')
assert.equal(metrics.actualMaintenance, expectedMaintenance, 'actual maintenance must reconcile to actual maintenance records')
assert.equal(metrics.actualOperatingCost, expectedOperatingCost, 'operating cost must include fuel, excluded toll/parking, and actual maintenance exactly once')
assert.equal(metrics.operatingProfit, expectedFinancialRevenue - expectedOperatingCost, 'operating profit must reconcile to financial revenue less actual operating cost')
assert.equal(metrics.maintenanceProvisionAccumulated, expectedMaintenanceProvision, 'maintenance provision must reconcile to KM times the effective ₹1.60/km rate')
assert.equal(metrics.renewalProvision, expectedComplianceAccrual, 'full-history compliance accrual must reconcile to covered validity-record costs')
assert.equal(metrics.performanceHeadlineActualProfit, metrics.operatingProfit - metrics.performanceHeadlineScheduledEmi, 'actual P/L must deduct the full scheduled EMI obligation')
assert.equal(
  roundMoney(metrics.performanceHeadlineActualProfit - metrics.performanceHeadlineProvisionalProfit),
  roundMoney(metrics.maintenanceProvision + metrics.renewalProvision + metrics.preBusinessRecoveryForPeriod + metrics.historicalMaintenanceRecoveryForPeriod),
  'provisional deduction components must reconcile to actual minus provisional P/L without deducting loan provision twice',
)
assert.equal(metrics.actualLoanPaid, 0, 'synthetic baseline deliberately has no actual loan payments')
assert.equal(metrics.actualPrepayment, 0, 'synthetic baseline deliberately has no prepayments')

const expectedActualProfit = metrics.operatingProfit - metrics.performanceHeadlineScheduledEmi
const expectedIndicativeProfit = metrics.performanceHeadlineProvisionalProfit
assert.ok(Number.isFinite(metrics.actualProfit))
assert.ok(Number.isFinite(metrics.indicativeProfit))
assert.ok(Math.abs(metrics.actualProfit - expectedActualProfit) < 1e-9)
assert.ok(Math.abs(metrics.indicativeProfit - expectedIndicativeProfit) < 1e-9)
assert.ok(Math.abs(metrics.totalIndicativeProvision - (
  metrics.loanProvisionForPeriod + metrics.maintenanceProvision + metrics.renewalProvision
)) < 1e-9)
assert.equal(metrics.authority.actualProfit, 'OPERATING_PROFIT_MINUS_FULL_SCHEDULED_EMI')
assert.equal(metrics.authority.indicativeProfit, 'PROVISIONAL_PROFIT_AFTER_SCHEDULED_EMI_AND_NORMALIZED_HISTORICAL_RECOVERY')

console.log('Synthetic end-to-end Performance calculation contract: PASS')