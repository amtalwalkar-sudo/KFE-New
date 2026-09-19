import assert from 'node:assert/strict'
import { acceptPickupGpsPoint, isPickupGpsPoint, pickupGpsTestSummary, PICKUP_GPS_INTERVAL_MS } from '../services/deadKmPickupGpsService.js'

const point = (milliseconds, accuracy = 8) => ({
  coords: { latitude: 19.119, longitude: 72.847 + milliseconds * 0.00000001, accuracy },
  timestamp: Date.parse('2026-09-19T10:00:00Z') + milliseconds
})

let points = []
points = acceptPickupGpsPoint(points, point(0))
points = acceptPickupGpsPoint(points, point(2000))
points = acceptPickupGpsPoint(points, point(4000))
assert.equal(PICKUP_GPS_INTERVAL_MS, 2000)
assert.equal(points.length, 3)
assert.equal(isPickupGpsPoint(points[0]), true)
assert.equal(isPickupGpsPoint({ latitude: 19, longitude: 72, accuracy: 150 }), false)
const summary = pickupGpsTestSummary(points)
assert.equal(summary.points, 3)
assert.equal(summary.nearTwoSecondIntervals, 2)
assert.equal(summary.passed, true)
console.log('Pickup GPS contract passed: 2-second points accepted and point-gap test passed.')
