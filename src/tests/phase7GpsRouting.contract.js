import assert from 'node:assert/strict'
import fs from 'node:fs'
const location=fs.readFileSync('src/services/locationService.js','utf8')
assert.match(location,/GPS_INTERVALS_MS = Object\.freeze/)
assert.match(location,/WAITING: 7 \* 60 \* 1000/); assert.match(location,/TRIP_ACTIVE: 9 \* 60 \* 1000/)
assert.match(location,/BETWEEN_TRIPS_MOVING: 2 \* 60 \* 1000/); assert.match(location,/BETWEEN_TRIPS_STATIONARY: 6 \* 60 \* 1000/)
assert.match(location,/GPS_WATCH_OPTIONS/); assert.match(location,/enableHighAccuracy: false/); assert.match(location,/maximumAge: 30000/)
assert.doesNotMatch(location,/watchPosition\([^\n]*enableHighAccuracy: true/)
assert.match(location,/getIntervals\(\)/); assert.match(location,/captureBoundarySnapshot/)
assert.match(location,/startAndroidForegroundService/); assert.match(location,/stopAndroidForegroundService/)
console.log('KFE Phase 7 GPS cadence and battery contract: PASS')