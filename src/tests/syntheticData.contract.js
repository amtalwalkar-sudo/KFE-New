import assert from 'node:assert/strict'
import { SYNTHETIC_STAGES, buildSyntheticSnapshot } from '../application/synthetic/syntheticDataService.js'
import { clearSyntheticDateContext, getKfeReferenceNow, istCalendarDaysInclusive, istDateKey, reportingRangeFor, setSyntheticDateContext } from '../domain/time/ist.js'
import { deriveLoanPosition } from '../domain/finance/loanEngine.js'

assert.deepEqual(SYNTHETIC_STAGES.map(stage => stage.days), [7, 30, 182, 365, 1818, 42])
assert.equal(SYNTHETIC_STAGES.find(stage => stage.key === 'forecastSimulation')?.profile, 'forecastSimulation')
const week = buildSyntheticSnapshot(7)
const month = buildSyntheticSnapshot(30)
const full = buildSyntheticSnapshot(1818)
const forecastSimulation = buildSyntheticSnapshot(42, { profile: 'forecastSimulation' })

for (const snapshot of [week, month, full, forecastSimulation]) {
  assert.equal(snapshot.vehicles.length, 1)
  assert.equal(snapshot.drivers.length, 1)
  assert.equal(snapshot.loans.length, 1)
  assert.equal(snapshot.loans[0].principal, 550000)
  assert.equal(snapshot.loans[0].annualInterestRatePercent, 10)
  assert.equal(snapshot.loans[0].startDate, '2026-05-01')
  assert.equal(snapshot.loans[0].status, 'Active')
  assert.ok(snapshot.shifts.every(row => row.synthetic === true))
  assert.ok(snapshot.trips.every(row => row.synthetic === true && row.revenueAuthority === 'SUPPORTING_ONLY'))
  assert.ok(snapshot.fuel_logs.every(row => row.synthetic === true && row.isFullTank === true))
  assert.ok(snapshot.compliance_records.every(row => row.synthetic === true))
  assert.ok(snapshot.maintenance_records.every(row => row.synthetic === true))
  assert.equal(snapshot.settings.length, 1)
  assert.equal(snapshot.settings[0].synthetic, undefined)
  assert.equal(snapshot.settings[0].values.synthetic, true)
}
assert.equal(week.shifts.length, 7)
assert.equal(month.shifts.length, 30)
assert.equal(forecastSimulation.shifts.length, 42)
const simulationKms = forecastSimulation.shifts.slice(-22).map(row => row.endOdometer - row.startOdometer)
assert.deepEqual(simulationKms.slice(0, 5), [200, 200, 200, 200, 200])
assert.deepEqual(simulationKms.slice(5, 10), [280, 280, 280, 280, 280])
assert.deepEqual(simulationKms.slice(10, 15), [300, 300, 300, 300, 300])
assert.deepEqual(simulationKms.slice(15, 20), [100, 100, 100, 100, 100])
assert.deepEqual(simulationKms.slice(20), [500, 50])
assert.equal(forecastSimulation.settings[0].values.forecastSimulation.scenarioWindowDays, 22)
assert.ok(forecastSimulation.settings[0].values.forecastSimulation.scenarios.includes('100→300 reversal'))
const istToday = istDateKey(new Date())
const istYesterday = istDateKey(new Date(Date.parse(`${istToday}T00:00:00Z`) - 86400000))
const expectedFullShiftDays = istCalendarDaysInclusive('2026-05-01', istYesterday)
assert.equal(full.shifts.length, expectedFullShiftDays)
assert.equal(week.loan_payments.length, 0)
assert.equal(month.loan_payments.length, 0)
assert.equal(full.loan_payments.length, 0)
const syntheticLoanPosition = deriveLoanPosition({ loan: full.loans[0], payments: full.loan_payments, prepayments: full.prepayments, asOf: full.settings[0].values.currentDateTime })
assert.equal(syntheticLoanPosition.available, true)
assert.ok(syntheticLoanPosition.overdue.length >= 1, 'Synthetic loan must expose unpaid overdue EMIs through the current date')
assert.ok(syntheticLoanPosition.totalOverdue > 0, 'Synthetic loan must expose a positive overdue amount')
assert.equal(week.settings[0].values.startDate, '2026-05-01')
assert.equal(week.settings[0].values.endDate, istToday)
assert.ok(full.compliance_records.some(row => row.complianceType === 'Road Tax'))
assert.ok(full.compliance_records.some(row => row.complianceType === 'Authorization'))
assert.ok(full.break_even_inputs.some(row => row.maintenanceProvisionPerKm === 0.6))
assert.ok(full.break_even_inputs.some(row => row.maintenanceProvisionPerKm === 1.6))
assert.ok(full.odoGaps.some(row => row.category === 'PERSONAL_TRIPS'))
assert.ok(full.odoGaps.some(row => row.category === 'DEAD_MILES'))
assert.ok(full.shifts.some(row => row.tollParkingRevenueTreatment === 'INCLUDED'))
assert.ok(full.shifts.some(row => row.tollParkingRevenueTreatment === 'EXCLUDED'))
assert.equal(full.pending_mutations.length, 0)
assert.equal(full.audit_history.length, 0)

console.log('Synthetic isolated data contract: PASS')


globalThis.sessionStorage = {
  _data: new Map(),
  getItem(key) { return this._data.has(key) ? this._data.get(key) : null },
  setItem(key, value) { this._data.set(key, String(value)) },
  removeItem(key) { this._data.delete(key) },
}
setSyntheticDateContext({ startDate: '2026-05-01', endDate: '2026-09-18', endAt: '2026-09-18T00:30:00.000Z' })
assert.equal(istDateKey(getKfeReferenceNow()), '2026-09-18')
assert.equal(getKfeReferenceNow().toISOString(), '2026-09-18T00:30:00.000Z')
const syntheticMonth = reportingRangeFor('MONTH')
assert.equal(istDateKey(syntheticMonth.from), '2026-09-01')
assert.equal(istDateKey(syntheticMonth.to), '2026-09-18')
clearSyntheticDateContext()
assert.notEqual(istDateKey(getKfeReferenceNow()), '2026-04-15')

console.log('Synthetic date context contract: PASS')
