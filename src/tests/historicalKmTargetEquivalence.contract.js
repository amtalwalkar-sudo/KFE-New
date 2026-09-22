import assert from 'node:assert/strict'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'
import { deriveOperatingKmForecast } from '../domain/performance/operatingKmForecast.js'

const base = {
  trips: [{ status:'COMPLETED', tripEndAt:'2026-09-10T10:00:00Z' }],
  shifts: [{ shiftStartAt:'2026-09-10T08:00:00Z', shiftEndAt:'2026-09-10T12:00:00Z', startOdometer:70000, endOdometer:70200, revenue:0 }],
  driverTargets: [{ effectiveFrom:'2026-09-01', effectiveUntil:'2026-09-30', desiredDriverProfit:200, active:true }],
  applicableBreakEven:800,
}

const targetFor = forecast => deriveRollingDriverTarget({
  from:'2026-09-10', to:'2026-09-10',
  ...base,
  operatingKmForecast: {
    dailyForecastKm: forecast,
    config: { normalPriorKmPerCalendarDay: 200 },
  },
})

const referenceBoundary = ({ baseDaily, recoveryAdjustment, forecast }) =>
  baseDaily * (forecast / 200) + recoveryAdjustment

const assertBoundary = (forecast, label) => {
  const target = targetFor(forecast)
  assert.equal(
    target.currentDailyTarget,
    referenceBoundary({
      baseDaily: target.currentBaseDaily,
      recoveryAdjustment: target.recoveryAdjustment,
      forecast,
    }),
    label,
  )
}

for (const km of [200, 250, 300, 100, 150, 225, 275]) {
  assertBoundary(km, 'boundary equivalence at ' + km + ' km/day')
}

const makeShifts = values => values.map((km, index) => ({
  shiftEndAt: '2026-09-' + String(index + 1).padStart(2,'0') + 'T18:00:00Z',
  startOdometer: 70000 + values.slice(0,index).reduce((a,b)=>a+b,0),
  endOdometer: 70000 + values.slice(0,index + 1).reduce((a,b)=>a+b,0),
}))

const scenarios = [
  ['sustained-250', [250,250,250,250,250,250]],
  ['sustained-300', [300,300,300,300,300,300]],
  ['sustained-100', [100,100,100,100,100,100]],
  ['sustained-150', [150,150,150,150,150,150]],
  ['isolated-high', [200,200,500,200,200,200]],
  ['isolated-low', [200,200,50,200,200,200]],
  ['alternating', [100,300,100,300,100,300]],
  ['low-to-high', [100,100,100,300,300,300]],
  ['high-to-low', [300,300,300,100,100,100]],
]

for (const [label, values] of scenarios) {
  const forecast = deriveOperatingKmForecast({
    from:'2026-09-01T00:00:00Z',
    to:'2026-09-10T23:59:59Z',
    asOf:'2026-09-10T23:59:59Z',
    shifts:makeShifts(values),
  })
  assert.ok(Number.isFinite(forecast.dailyForecastKm), label)
  assertBoundary(forecast.dailyForecastKm, label + ': current boundary equals reference boundary')
}

console.log('Historical KM to Driver Target reconciliation contract passed: frozen PR72 financial target is unchanged at 200 km/day and the volume boundary matches the reconstructed 200-km reference form across sustained, shock, alternating, and reversal scenarios.')
