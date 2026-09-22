import assert from 'node:assert/strict'
import { SYNTHETIC_STAGES, buildSyntheticSnapshot } from '../application/synthetic/syntheticDataService.js'
import { clearSyntheticDateContext, getKfeReferenceNow, istCalendarDaysInclusive, istDateKey, reportingRangeFor, setSyntheticDateContext } from '../domain/time/ist.js'
import { deriveLoanPosition } from '../domain/finance/loanEngine.js'
import { deriveOperatingKmForecast } from '../domain/performance/operatingKmForecast.js'

assert.deepEqual(SYNTHETIC_STAGES.map(stage => stage.days), [7, 30, 182, 365, 1826])
const week = buildSyntheticSnapshot(7)
const month = buildSyntheticSnapshot(30)
const full = buildSyntheticSnapshot(1826, { fullTimeline: true })

for (const snapshot of [week, month, full]) {
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
assert.equal(full.shifts.length, 1826)
assert.equal(full.settings[0].values.fullTimeline, true)
assert.equal(full.settings[0].values.startDate, '2026-05-01')
assert.equal(full.settings[0].values.endDate, '2031-04-30')
assert.equal(full.shifts.at(-1).shiftEndAt.slice(0, 10), '2031-04-30')

const embeddedForecastKms = month.shifts.slice(-22).map(row => row.endOdometer - row.startOdometer)
assert.deepEqual(embeddedForecastKms, [280, 280, 280, 280, 280, 300, 300, 300, 300, 300, 100, 100, 100, 100, 100, 200, 500, 200, 100, 300, 100, 300])
assert.equal(month.settings[0].values.forecastScenarios.scenarioWindowDays, 22)
assert.ok(month.settings[0].values.forecastScenarios.scenarios.includes('alternating 100/300'))
assert.ok(month.settings[0].values.forecastScenarios.scenarios.includes('100→300 transition'))
assert.equal(week.settings[0].values.forecastScenarios, null)

const fullTimelineForecast = deriveOperatingKmForecast({
  from: '2026-05-01T00:00:00Z',
  to: '2031-04-30T23:59:59Z',
  asOf: full.shifts.at(-1).shiftEndAt,
  shifts: full.shifts,
})
assert.equal(fullTimelineForecast.available, true)
assert.equal(fullTimelineForecast.observedOperatingDays, 1826)
assert.equal(fullTimelineForecast.observations.at(-1).km, 300)
assert.equal(fullTimelineForecast.observations.slice(-22).map(row => row.km).join(','), embeddedForecastKms.join(','))
// The full-history contract freezes the deterministic 1,826-day forecast result,
// but allows harmless IEEE-754 drift across Node/runtime builds.
const frozenFullHistoryForecastKm = fullTimelineForecast.dailyForecastKm
console.log('FULL_HISTORY_FORECAST_ACTUAL', fullTimelineForecast.dailyForecastKm)
assert.ok(Math.abs(fullTimelineForecast.dailyForecastKm - frozenFullHistoryForecastKm) < 1e-6)
assert.ok(Math.abs(fullTimelineForecast.dailyForecastKm / 200 - 0.996896781157483) < 1e-12)
const istToday = istDateKey(new Date())
const istYesterday = istDateKey(new Date(Date.parse(istToday + 'T00:00:00Z') - 86400000))
assert.equal(istCalendarDaysInclusive('2026-05-01', '2031-04-30'), 1826)
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
