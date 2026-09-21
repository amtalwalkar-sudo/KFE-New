import assert from 'node:assert/strict'
import {
  OPERATING_KM_FORECAST_CONFIG,
  deriveOperatingKmForecast,
  updateOperatingKmForecast,
} from '../domain/performance/operatingKmForecast.js'

assert.equal(OPERATING_KM_FORECAST_CONFIG.normalPriorKmPerCalendarDay, 200)
assert.equal(OPERATING_KM_FORECAST_CONFIG.baselineEvidenceResponse, 0.10)
assert.equal(OPERATING_KM_FORECAST_CONFIG.maxEvidenceResponse, 0.30)
assert.equal(OPERATING_KM_FORECAST_CONFIG.persistenceDays, 5)
assert.equal(OPERATING_KM_FORECAST_CONFIG.robustDeviationKm, 75)

// Day 1 starts from the frozen 200 km/calendar-day prior.
const day1 = updateOperatingKmForecast({}, 280)
assert.ok(day1.dailyForecastKm > 200)
assert.ok(day1.dailyForecastKm < 280)
assert.equal(day1.persistenceDays, 1)

// Sustained regimes converge upward/downward without jumping directly to the observation.
let high = {}
for (let i = 0; i < 20; i += 1) high = updateOperatingKmForecast(high, 280)
assert.ok(high.dailyForecastKm > 275)
assert.ok(high.dailyForecastKm < 280)

let low = {}
for (let i = 0; i < 20; i += 1) low = updateOperatingKmForecast(low, 100)
assert.ok(low.dailyForecastKm < 105)
assert.ok(low.dailyForecastKm > 100)

// A sustained 200 km/day regime remains anchored at the normal prior.
let normal = {}
for (let i = 0; i < 20; i += 1) normal = updateOperatingKmForecast(normal, 200)
assert.equal(normal.dailyForecastKm, 200)

// One extreme observation is robustly clipped and cannot redefine the forecast.
const extreme = updateOperatingKmForecast({}, 1000)
assert.ok(extreme.dailyForecastKm <= 275)
assert.equal(extreme.persistenceDays, 1)

// Alternating extremes do not build persistence.
let noisy = {}
for (const value of [100, 350, 100, 350, 100, 350]) noisy = updateOperatingKmForecast(noisy, value)
assert.ok(noisy.dailyForecastKm > 150)
assert.ok(noisy.dailyForecastKm < 250)
assert.equal(noisy.persistenceDays, 1)

// A sustained regime can reverse and then reconverge.
let reversal = {}
for (let i = 0; i < 12; i += 1) reversal = updateOperatingKmForecast(reversal, 280)
const highPoint = reversal.dailyForecastKm
for (let i = 0; i < 12; i += 1) reversal = updateOperatingKmForecast(reversal, 100)
assert.ok(reversal.dailyForecastKm < highPoint)
for (let i = 0; i < 12; i += 1) reversal = updateOperatingKmForecast(reversal, 280)
assert.ok(reversal.dailyForecastKm > highPoint - 5)

// Full-period forecast starts with the prior and then learns from completed shifts.
const period = deriveOperatingKmForecast({
  from: '2026-09-01T00:00:00+05:30',
  to: '2026-09-30T23:59:59.999+05:30',
  asOf: '2026-09-03T23:59:59.999+05:30',
  shifts: [
    { shiftEndAt: '2026-09-01T18:00:00+05:30', startOdometer: 70000, endOdometer: 70280 },
    { shiftEndAt: '2026-09-02T18:00:00+05:30', startOdometer: 70280, endOdometer: 70560 },
    { shiftEndAt: '2026-09-03T18:00:00+05:30', startOdometer: 70560, endOdometer: 70840 },
  ],
})
assert.equal(period.observedOperatingDays, 3)
assert.equal(period.observedKm, 840)
assert.equal(period.calendarDays, 30)
assert.equal(period.remainingCalendarDays, 27)
assert.ok(period.dailyForecastKm > 200)
assert.equal(period.calculatedForecast.fullPeriodKm, period.fullMonthForecastKm)
assert.equal(period.effectiveForecast.fullPeriodKm, period.calculatedForecast.fullPeriodKm)

// Future override-ready boundary: current implementation deliberately has no override UI;
// effective forecast is exactly the calculated forecast.
assert.deepEqual(period.effectiveForecast, period.calculatedForecast)

console.log('Operating KM forecast contract passed: prior, robust evidence, persistence, conservative trend response, reversal, and override-ready output boundary are explicit.')
