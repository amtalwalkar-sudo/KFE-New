import assert from 'node:assert/strict'
import fs from 'node:fs'
import { calculateFuelPeriodSummary } from '../domain/math/fuel.js'

const fullTank = (id, capturedAt, odometer, amount) => ({
  id, vehicleId: 'vehicle-1', capturedAt, odometer, amount,
  quantityKg: amount / 20, pricePerKg: 20, isFullTank: true,
})
const previous = fullTank('previous', '2026-10-01T10:00:00.000Z', 1000, 100)
const current = fullTank('current', '2026-10-02T10:00:00.000Z', 1100, 250)
const partial = {
  id: 'partial', vehicleId: 'vehicle-1', capturedAt: '2026-10-02T11:00:00.000Z',
  odometer: 1105, amount: 50, quantityKg: 2.5, pricePerKg: 20, isFullTank: false,
}
const next = fullTank('next', '2026-10-03T10:00:00.000Z', 1200, 300)
const range = { from: new Date('2026-10-02T00:00:00.000Z'), to: new Date('2026-10-02T23:59:59.999Z') }

const summary = calculateFuelPeriodSummary([previous, current, partial, next], range)
assert.equal(summary.totalFuelAmount, 300, 'period expenditure includes both full and partial fills in range')
assert.equal(summary.averageCostPerKm, 2.5, 'cost/km is weighted by valid distance, not an arithmetic mean of interval ratios')
assert.equal(summary.intervalKm, 100, 'the prior full-tank record is retained as a baseline outside the period')
assert.equal(summary.intervalCount, 1, 'only intervals whose ending full-tank refill is in range count')

const noBaseline = calculateFuelPeriodSummary([partial], range)
assert.equal(noBaseline.totalFuelAmount, 50, 'partial fill still counts toward fuel expenditure')
assert.equal(noBaseline.averageCostPerKm, null, 'partial fills alone cannot fabricate a cost/km interval')

const invalidRange = calculateFuelPeriodSummary([current], { from: 'bad', to: 'also-bad' })
assert.equal(invalidRange.totalFuelAmount, 0)
assert.equal(invalidRange.averageCostPerKm, null)

const service = fs.readFileSync('src/application/timeline/activityTimelineReadService.js', 'utf8')
const view = fs.readFileSync('src/views/ActivityTimelineView.vue', 'utf8')
const router = fs.readFileSync('src/router/index.js', 'utf8')
assert.match(service, /ShiftTripRepository\.getAllTrips\(\)/)
assert.match(service, /FuelRepository\.getAll\(\)/)
assert.match(service, /calculateFuelPeriodSummary\(allFuelLogs, range\)/)
assert.doesNotMatch(service, /FuelRepository\.(create|update|remove)\(/, 'Timeline query must not mutate fuel records')
assert.doesNotMatch(service, /ShiftTripRepository\.(create|update|remove|complete|cancel)/, 'Timeline query must not mutate operational records')
assert.doesNotMatch(view, /captureTripBoundaryLocation|resolveLocationName|EventLocationService/, 'viewing Timeline must not capture GPS or geocode')
assert.match(view, /Average fuel cost\/km/)
assert.match(view, /Total amount refilled/)
assert.match(view, /Location unavailable/)
assert.match(router, /path: '\/timeline', name: 'Timeline', component: ActivityTimelineView/)
assert.match(router, /path: '\/performance', name: 'Performance', component: BlankWorkspaceView/)

console.log('Timeline read-only architecture and period fuel calculation contract: PASS')
