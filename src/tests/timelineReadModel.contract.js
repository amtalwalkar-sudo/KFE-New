import assert from 'node:assert/strict'
import fs from 'node:fs'
import { calculateFuelPeriodSummary } from '../domain/math/fuel.js'
import { tripPeriodTime, locationLabel } from '../application/timeline/activityTimelineReadService.js'

const fullTank = (id, capturedAt, odometer, amount) => ({ id, vehicleId: 'vehicle-1', capturedAt, odometer, amount, quantityKg: amount / 20, pricePerKg: 20, isFullTank: true })
const previous = fullTank('previous', '2026-10-01T10:00:00.000Z', 1000, 100)
const current = fullTank('current', '2026-10-02T10:00:00.000Z', 1100, 250)
const partial = { id: 'partial', vehicleId: 'vehicle-1', capturedAt: '2026-10-02T11:00:00.000Z', odometer: 1105, amount: 50, quantityKg: 2.5, pricePerKg: 20, isFullTank: false }
const next = fullTank('next', '2026-10-03T10:00:00.000Z', 1200, 300)
const range = { from: new Date('2026-10-02T00:00:00.000Z'), to: new Date('2026-10-02T23:59:59.999Z') }
const summary = calculateFuelPeriodSummary([previous, current, partial, next], range)
assert.equal(summary.totalFuelAmount, 300)
assert.equal(summary.averageCostPerKm, 2.5)
assert.equal(summary.intervalKm, 100)
assert.equal(summary.intervalCount, 1)
const noBaseline = calculateFuelPeriodSummary([partial], range)
assert.equal(noBaseline.totalFuelAmount, 50)
assert.equal(noBaseline.averageCostPerKm, null)
const invalidRange = calculateFuelPeriodSummary([current], { from: 'bad', to: 'also-bad' })
assert.equal(invalidRange.totalFuelAmount, 0)
assert.equal(invalidRange.averageCostPerKm, null)

const cancelledAt = Date.parse('2026-10-02T18:45:00.000Z')
assert.equal(tripPeriodTime({ status: 'CANCELLED', tripStartAt: '2026-10-02T17:00:00.000Z', tripEndAt: '2026-10-02T18:45:00.000Z' }), cancelledAt)
assert.equal(tripPeriodTime({ status: 'CANCELLED', tripStartAt: '2026-10-02T17:00:00.000Z' }), Date.parse('2026-10-02T17:00:00.000Z'))
assert.equal(tripPeriodTime({ status: 'COMPLETED', tripStartAt: '2026-10-02T17:00:00.000Z', tripEndAt: '2026-10-02T18:00:00.000Z' }), Date.parse('2026-10-02T17:00:00.000Z'))
for (const snapshot of [null, {}, { latitude: null, longitude: 72.8 }, { latitude: 19.1, longitude: null }, { latitude: '', longitude: 72.8 }, { latitude: 91, longitude: 72.8 }, { latitude: 19.1, longitude: 181 }]) {
  assert.equal(locationLabel(snapshot), 'Location unavailable')
}
assert.equal(locationLabel({ id: 'gps-1', latitude: 19.076, longitude: 72.8777 }, new Map(), true), '19.07600, 72.87770',
  'coordinates are the offline fallback only')
assert.equal(locationLabel({ id: 'gps-1', latitude: 19.076, longitude: 72.8777 }, new Map(), false), 'Location unavailable')
assert.equal(locationLabel({ id: 'gps-1', latitude: 19.076, longitude: 72.8777 }, new Map([['gps-1', { placeName: 'Verified locality' }]]), false), 'Verified locality')

const service = fs.readFileSync('src/application/timeline/activityTimelineReadService.js', 'utf8')
const view = fs.readFileSync('src/views/ActivityTimelineView.vue', 'utf8')
const router = fs.readFileSync('src/router/index.js', 'utf8')
assert.match(service, /ShiftTripRepository\.getAllTrips\(\)/)
assert.match(service, /FuelRepository\.getAll\(\)/)
assert.match(service, /calculateFuelPeriodSummary\(allFuelLogs, range\)/)
assert.doesNotMatch(service, /FuelRepository\.(create|update|remove)\(/)
assert.doesNotMatch(service, /ShiftTripRepository\.(create|update|remove|complete|cancel)/)
assert.match(service, /const periodTrips = trips\.filter/)
assert.match(service, /EventLocationService\.forEntities\('TRIP', periodTrips\.map/)
assert.match(service, /LocalityRepository\.forSnapshotIds/)
assert.doesNotMatch(service, /resolveLocationName|tripStartLocation|tripEndLocation/)
assert.doesNotMatch(view, /captureTripBoundaryLocation/)
assert.match(view, /EventLocalityService\.resolveSnapshots\(eligible\)/)
assert.match(view, /Pull down to resolve unsaved GPS locality names from the last seven days when online/)
assert.match(view, /@touchend\.passive="onTouchEnd"/)
assert.match(view, /Average fuel cost\/km/)
assert.match(view, /Total amount refilled/)
assert.match(service, /pickupArea: pickupName/)
assert.match(service, /dropArea: trip\.status === 'COMPLETED' \? dropName : 'Location unavailable'/)
assert.match(service, /trip\?\.status === 'CANCELLED'\) return validTime\(trip\.tripEndAt\)/)
assert.match(router, /path: '\/timeline', name: 'Timeline', component: ActivityTimelineView/)
assert.match(router, /path: '\/performance', name: 'Performance', component: PerformanceView/)
console.log('PASS: Timeline is read-only, period-scoped, permanently locality-backed, and offline-coordinate aware')
