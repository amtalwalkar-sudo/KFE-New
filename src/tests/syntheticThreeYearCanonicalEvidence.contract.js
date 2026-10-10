import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'
import { deriveLoanPosition } from '../domain/finance/loanEngine.js'
import { deriveRollingDriverTarget, stabilizeActiveDay } from '../domain/performance/driverTargetStabilization.js'
import { PerformanceService } from '../application/performance/performanceService.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const generator = path.join(root, 'tests/fixtures/synthetic-three-year/generate-fixture.cjs')
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kfe-three-year-canonical-'))
try {
  const generated = spawnSync(process.execPath, [generator, outputDir], { encoding: 'utf8' })
  assert.equal(generated.status, 0, `synthetic fixture generator must succeed: ${generated.stderr}`)
  const fixture = JSON.parse(fs.readFileSync(path.join(outputDir, 'fixture.json'), 'utf8'))
  assert.equal(fixture.synthetic, true)
  assert.equal(fixture.isolation.pwaStorageRead, false)
  assert.equal(fixture.isolation.pwaStorageWrite, false)
  assert.equal(fixture.daily.length, 1096)
  assert.equal(fixture.expectedAggregates.complianceProvisionInr, 90000)
  assert.equal(fixture.expectedAggregates.calendarDays, 1096)
  assert.equal(fixture.expectedAggregates.totalDistanceKm, 219200)
  assert.equal(fixture.expectedAggregates.fuelCostInr, 701440)
  assert.equal(fixture.expectedAggregates.ongoingMaintenanceProvisionInr, 350720)
  assert.equal(fixture.expectedAggregates.emiPaymentCount, 36)
  assert.equal(fixture.expectedAggregates.emiTotalInr, 407664)
  assert.equal(fixture.expectedAggregates.preBusinessMaintenanceObligationInr, 36000)

  // Reconcile every generated monthly rollup against its daily source rows.
  for (const month of fixture.monthly) {
    const dailyRows = fixture.daily.filter(day => day.date.startsWith(month.month))
    assert.equal(month.operatingDays, dailyRows.length, `${month.month}: operating-day count must match daily records`)
    assert.equal(month.totalKm, dailyRows.reduce((sum, day) => sum + day.totalKm, 0), `${month.month}: monthly KM must reconcile to daily KM`)
    assert.equal(month.fuelCostInr, dailyRows.reduce((sum, day) => sum + day.fuelCostInr, 0), `${month.month}: fuel cost must reconcile to daily rows`)
    assert.equal(month.maintenanceProvisionInr, dailyRows.reduce((sum, day) => sum + day.maintenanceProvisionInr, 0), `${month.month}: maintenance provision must reconcile to daily rows`)
    assert.equal(month.emiPaymentInr, dailyRows.reduce((sum, day) => sum + day.emiPaymentInr, 0), `${month.month}: EMI cash must reconcile to daily rows`)
  }
  assert.equal(Math.round(fixture.monthly.reduce((sum, month) => sum + month.complianceProvisionInr, 0) * 100) / 100, 90000)
  assert.equal(fixture.specialCases.targetSurplus.expectedDailyTargetInr, 0)
  assert.equal(fixture.specialCases.targetSurplus.earnedEligibleAmountInr - fixture.specialCases.targetSurplus.requiredTargetInr, fixture.specialCases.targetSurplus.expectedSurplusCreditInr)
  assert.equal(fixture.specialCases.fuelPrecision.expectedQuantityKgExact, 500 / 82)
  assert.equal(fixture.specialCases.fuelPrecision.expectedQuantityKgDisplay2dp, 6.1)
  assert.equal(fixture.specialCases.provisionalDeduction.expectedTotalInr, 815)
  assert.equal(fixture.specialCases.breakEven.expectedBreakEvenInr, 4672)
  for (const year of [2023, 2024, 2025]) {
    const annualDaily = fixture.daily.filter(day => day.date.startsWith(String(year))).reduce((sum, day) => sum + day.complianceProvisionInr, 0)
    const annualMonthly = fixture.monthly.filter(month => month.month.startsWith(String(year))).reduce((sum, month) => sum + month.complianceProvisionInr, 0)
    assert.ok(Math.abs(annualDaily - 30000) < 1e-7, `${year} daily compliance accrual must sum to its annual validity cost`)
    assert.equal(Math.round(annualMonthly * 100) / 100, 30000, `${year} monthly rollups must reconcile exactly after paise rounding`)
  }

  const selectedPeriod = {
    from: new Date('2022-12-31T18:30:00.000Z'),
    to: new Date('2025-12-31T18:29:59.999Z'),
  }
  let odometer = 0
  const shifts = fixture.daily.map(day => {
    const startOdometer = odometer
    odometer += day.totalKm
    return {
      id: day.id,
      shiftStartAt: `${day.date}T08:00:00+05:30`,
      shiftEndAt: `${day.date}T18:00:00+05:30`,
      startOdometer,
      endOdometer: odometer,
      revenue: 0,
    }
  })
  const compliance = [2023, 2024, 2025].map(year => ({
    id: `compliance-${year}`,
    cost: 30000,
    validFrom: `${year - 1}-12-31T18:30:00.000Z`,
    validUntil: `${year}-12-31T18:29:59.999Z`,
  }))
  const settlements = [
    { id: 'maint-overpay', sourceType: 'Maintenance', direction: 'OUT', amount: 400000, paidOn: '2025-12-31T12:00:00+05:30' },
    { id: 'compliance-2023-paid', sourceType: 'Compliance', sourceId: 'compliance-2023', direction: 'OUT', amount: 30000, paidOn: '2023-12-31T12:00:00+05:30' },
    { id: 'compliance-2024-paid', sourceType: 'Compliance', sourceId: 'compliance-2024', direction: 'OUT', amount: 30000, paidOn: '2024-12-31T12:00:00+05:30' },
    { id: 'compliance-2025-paid', sourceType: 'Compliance', sourceId: 'compliance-2025', direction: 'OUT', amount: 35000, paidOn: '2025-12-31T12:00:00+05:30' },
  ]
  // Run the canonical engine over the same three-year odometer timeline with
  // the fixture's explicit fuel cost. This checks calculated outputs, not just
  // arithmetic stored by the fixture generator.
  const canonicalFuelLogs = fixture.daily.map(day => ({
    id: `fuel-${day.date}`,
    capturedAt: `${day.date}T17:00:00+05:30`,
    amount: day.fuelCostInr,
    quantityKg: 0,
    vehicleId: 'synthetic-vehicle',
    isFullTank: false,
  }))
  const fullFinancial = derivePerformance({
    shifts,
    trips: [],
    fuelLogs: canonicalFuelLogs,
    maintenance: [],
    compliance,
    settlements: [],
    breakEvenInputs: [{ effectiveFrom: '2023-01-01', maintenanceProvisionPerKm: 1.6 }],
  }, selectedPeriod)
  assert.equal(fullFinancial.vehicleKm, fixture.expectedAggregates.totalDistanceKm)
  assert.equal(fullFinancial.fuelCost, fixture.expectedAggregates.fuelCostInr)
  assert.equal(fullFinancial.actualOperatingCost, fixture.expectedAggregates.fuelCostInr)
  assert.equal(fullFinancial.operatingProfit, -fixture.expectedAggregates.fuelCostInr)
  assert.equal(fullFinancial.maintenanceProvisionAccumulated, fixture.expectedAggregates.ongoingMaintenanceProvisionInr)
  assert.equal(fullFinancial.renewalProvision, fixture.expectedAggregates.complianceProvisionInr)
  assert.equal(fullFinancial.provisionAdjustedProfit, -fixture.expectedAggregates.fuelCostInr - fixture.expectedAggregates.ongoingMaintenanceProvisionInr - fixture.expectedAggregates.complianceProvisionInr)

  const canonical = derivePerformance({
    shifts,
    trips: [],
    fuelLogs: [],
    maintenance: [],
    compliance,
    settlements,
    breakEvenInputs: [{ effectiveFrom: '2023-01-01', maintenanceProvisionPerKm: 1.6 }],
  }, selectedPeriod)
  const money = value => Number.isFinite(Number(value)) ? `₹${Math.round(Number(value)).toLocaleString('en-IN')}` : '—'
  const expected = {
    vehicleKm: 219200,
    maintenanceAccruedInr: 350720,
    maintenancePaymentsInr: 400000,
    maintenanceBalanceInr: 0,
    maintenanceExcessPaymentInr: 49280,
    complianceAccruedInr: 90000,
    compliancePaymentsInr: 95000,
    complianceBalanceInr: 0,
    complianceExcessPaymentInr: 5000,
  }
  assert.equal(canonical.vehicleKm, expected.vehicleKm)
  assert.equal(canonical.maintenanceProvisionAccumulated, expected.maintenanceAccruedInr)
  assert.equal(canonical.maintenancePaymentsAccumulated, expected.maintenancePaymentsInr)
  assert.equal(canonical.maintenanceProvisionBalance, expected.maintenanceBalanceInr)
  assert.equal(canonical.maintenanceProvisionExcessPayments, expected.maintenanceExcessPaymentInr)
  assert.equal(canonical.renewalProvision, expected.complianceAccruedInr)
  assert.equal(canonical.complianceProvisionBalance, expected.complianceBalanceInr)
  assert.equal(canonical.complianceProvisionExcessPayments, expected.complianceExcessPaymentInr)
  assert.equal(Object.values(canonical.compliancePaymentsAccumulatedById).reduce((sum, value) => sum + value, 0), expected.compliancePaymentsInr)

  const leapRange = { from: new Date('2024-02-28T18:30:00.000Z'), to: new Date('2024-02-29T18:29:59.999Z') }
  const leapRecord = { id: 'leap-2024', cost: 30000, validFrom: '2023-12-31T18:30:00.000Z', validUntil: '2024-12-31T18:29:59.999Z' }
  const leapCanonical = derivePerformance({ shifts: [], trips: [], fuelLogs: [], maintenance: [], compliance: [leapRecord], settlements: [] }, leapRange)
  const leapDayExpected = 30000 / 366
  assert.ok(Math.abs(leapCanonical.renewalProvision - leapDayExpected) < 1e-9)
  assert.ok(Math.abs(leapCanonical.complianceProvisionAccumulatedById['leap-2024'] - (30000 * 60 / 366)) < 1e-9)

  const loan = { id: 'synthetic-loan-date-check', principal: 12000, tenureMonths: 12, startDate: '2024-01-01T00:00:00+05:30', annualInterestRatePercent: 0, status: 'Active' }
  const loanPayments = [
    { id: 'missing-date', loanId: loan.id, amount: 1000, status: 'PAID' },
    { id: 'empty-date', loanId: loan.id, amount: 1000, paidOn: '', status: 'PAID' },
    { id: 'invalid-date', loanId: loan.id, amount: 1000, paidOn: 'not-a-date', status: 'PAID' },
    { id: 'valid-date', loanId: loan.id, amount: 500, paidOn: '2024-01-15T12:00:00+05:30', status: 'PAID' },
  ]
  const loanCanonical = deriveLoanPosition({ loan, payments: loanPayments, asOf: '2024-02-01T12:00:00+05:30' })
  assert.equal(loanCanonical.invalidPaymentCount, 3)
  assert.equal(loanCanonical.invalidPaymentAmount, 3000)
  assert.equal(loanCanonical.actualPaid, 500)
  assert.equal(loanCanonical.schedule.reduce((sum, row) => sum + row.paidAmount, 0), 500)

  const view = fs.readFileSync(path.join(root, 'src/views/PerformanceView.vue'), 'utf8')
  assert.match(view, /Maintenance payments ahead of provision/)
  assert.match(view, /Compliance payments ahead of provision/)
  assert.match(view, /money\(m\.value\.maintenanceProvisionBalance\)/)
  assert.match(view, /money\(m\.value\.maintenanceProvisionExcessPayments\)/)
  assert.match(view, /money\(m\.value\.complianceProvisionBalance\)/)
  assert.match(view, /money\(m\.value\.complianceProvisionExcessPayments\)/)
  assert.match(view, /m\.value\.finance\?\.invalidPaymentCount/)
  assert.match(view, /money\(m\.value\.finance\?\.invalidPaymentAmount/)

  const evidence = [
    { fixtureId: 'THREE-YEAR-BASELINE', selectedPeriod: '2023-01-01..2025-12-31 IST', inputs: { days: 1096, kmPerDay: 200, maintenanceRateInrPerKm: 1.6, complianceCostInrPerYear: 30000, annualValidityDays: '365/366 by calendar year' }, expected: { vehicleKm: expected.vehicleKm, maintenanceProvisionInr: expected.maintenanceAccruedInr, complianceProvisionInr: expected.complianceAccruedInr }, canonical: { vehicleKm: canonical.vehicleKm, maintenanceProvisionInr: canonical.maintenanceProvisionAccumulated, complianceProvisionInr: canonical.renewalProvision }, displayed: { vehicleKm: 'not a headline on provision detail', maintenanceProvisionInr: money(canonical.maintenanceProvision), complianceProvisionInr: money(canonical.renewalProvision) }, expectedDisplayed: { vehicleKm: 'not a headline on provision detail', maintenanceProvisionInr: '₹3,50,720', complianceProvisionInr: '₹90,000' }, pass: true },
    { fixtureId: 'PROVISION-OVERPAY-001', selectedPeriod: '2023-01-01..2025-12-31 IST', inputs: { maintenancePaymentsInr: 400000, compliancePaymentsInr: 95000 }, expected: { maintenanceBalanceInr: 0, maintenanceExcessPaymentInr: 49280, complianceBalanceInr: 0, complianceExcessPaymentInr: 5000 }, canonical: { maintenanceBalanceInr: canonical.maintenanceProvisionBalance, maintenanceExcessPaymentInr: canonical.maintenanceProvisionExcessPayments, complianceBalanceInr: canonical.complianceProvisionBalance, complianceExcessPaymentInr: canonical.complianceProvisionExcessPayments }, displayed: { maintenanceBalance: money(canonical.maintenanceProvisionBalance), maintenanceExcessPayment: money(canonical.maintenanceProvisionExcessPayments), complianceBalance: money(canonical.complianceProvisionBalance), complianceExcessPayment: money(canonical.complianceProvisionExcessPayments) }, expectedDisplayed: { maintenanceBalance: '₹0', maintenanceExcessPayment: '₹49,280', complianceBalance: '₹0', complianceExcessPayment: '₹5,000' }, pass: true },
    { fixtureId: 'COMPLIANCE-LEAP-001', selectedPeriod: '2024-02-29 IST', inputs: { annualCostInr: 30000, validityDays: 366, validityFrom: leapRecord.validFrom, validityUntil: leapRecord.validUntil }, expected: { dailyAccrualExactInr: leapDayExpected, accruedThroughLeapDayInr: 30000 * 60 / 366 }, canonical: { dailyAccrualExactInr: leapCanonical.renewalProvision, accruedThroughLeapDayInr: leapCanonical.complianceProvisionAccumulatedById['leap-2024'] }, displayed: { dailyAccrual: money(leapCanonical.renewalProvision) }, expectedDisplayed: { dailyAccrual: '₹82' }, pass: true },
    { fixtureId: 'LOAN-INVALID-DATE-001', selectedPeriod: 'as of 2024-02-01 IST', inputs: { invalidDateCount: 3, invalidPaymentAmountInr: 3000, validDatedPaymentInr: 500 }, expected: { invalidPaymentCount: 3, invalidPaymentAmountInr: 3000, actualPaidInr: 500 }, canonical: { invalidPaymentCount: loanCanonical.invalidPaymentCount, invalidPaymentAmountInr: loanCanonical.invalidPaymentAmount, actualPaidInr: loanCanonical.actualPaid }, displayed: { invalidPaymentCount: String(loanCanonical.invalidPaymentCount), invalidPaymentAmountInr: money(loanCanonical.invalidPaymentAmount), actualPaidInr: money(loanCanonical.actualPaid) }, expectedDisplayed: { invalidPaymentCount: '3', invalidPaymentAmountInr: '₹3,000', actualPaidInr: '₹500' }, pass: true },
  ]
  for (const row of evidence) {
    assert.deepEqual(row.canonical, row.expected, `${row.fixtureId}: canonical output must equal independent expected oracle`)
    assert.ok(row.displayed && Object.keys(row.displayed).length, `${row.fixtureId}: displayed value must be recorded`)
    assert.deepEqual(row.displayed, row.expectedDisplayed, `${row.fixtureId}: formatted displayed values must match the UI oracle`)
  }
  // A large surplus must not create a negative target; unused surplus is
  // carried explicitly and remains available to reduce later active-day targets.
  const targetSurplus = deriveRollingDriverTarget({
    from: '2024-06-15T00:00:00+05:30',
    to: '2024-06-15T23:59:59+05:30',
    driverTargets: [{ effectiveFrom: '2024-06-01', effectiveUntil: '2024-06-30', targetRevenue: 30000, active: true }],
    shifts: [
      { id: 'surplus-prior-day', shiftStartAt: '2024-06-14T08:00:00+05:30', shiftEndAt: '2024-06-14T18:00:00+05:30', status: 'COMPLETED', revenue: 2500 },
      { id: 'surplus-current-day', shiftStartAt: '2024-06-15T08:00:00+05:30', status: 'ACTIVE' },
    ],
  })
  assert.equal(targetSurplus.currentBaseDaily, 1000)
  assert.equal(targetSurplus.balanceBefore, -1500)
  assert.equal(targetSurplus.currentDailyTarget, 0, 'surplus must never create a negative daily target')
  assert.equal(targetSurplus.surplusCreditBefore, 1500, 'surplus must remain available as a separate credit')
  assert.equal(targetSurplus.surplusCredit, 1500, 'unfinished active day must not consume credit prematurely')
  const stabilizedSurplus = stabilizeActiveDay({ baseTarget: 1000, balance: -1500, actualRevenue: null })
  assert.equal(stabilizedSurplus.target, 0, 'the shared active-day target helper must also clamp to zero')
  assert.equal(stabilizedSurplus.nextBalance, null)

  const targetServiceMetrics = PerformanceService.getMetrics({
    businessSetup: { businessStartDate: '2024-06-01' },
    shifts: [
      { id: 'service-surplus-prior', shiftStartAt: '2024-06-14T08:00:00+05:30', shiftEndAt: '2024-06-14T18:00:00+05:30', status: 'COMPLETED', startOdometer: 1000, endOdometer: 1100, revenue: 2500 },
      { id: 'service-surplus-current', shiftStartAt: '2024-06-15T08:00:00+05:30', status: 'ACTIVE', startOdometer: 1100, endOdometer: 1100 },
    ],
    trips: [], fuelLogs: [], maintenance: [], compliance: [], loans: [], loanPayments: [], prepayments: [],
    breakEvenInputs: [],
    driverTargets: [{ effectiveFrom: '2024-06-01', effectiveUntil: '2024-06-30', targetRevenue: 30000, active: true }],
  }, { from: new Date('2024-06-14T18:30:00.000Z'), to: new Date('2024-06-15T18:29:59.999Z') })
  assert.equal(targetServiceMetrics.target, 0, 'PerformanceService must not publish a negative target')
  assert.equal(targetServiceMetrics.driverTargetSurplusCredit, 1500, 'PerformanceService must publish the carried surplus as a separate metric')
  assert.equal(targetServiceMetrics.driverTargetCarriedShortfall, 0)

  console.log('Synthetic three-year canonical calculation evidence: PASS')
  console.log(JSON.stringify({ evidence }, null, 2))
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true })
}
