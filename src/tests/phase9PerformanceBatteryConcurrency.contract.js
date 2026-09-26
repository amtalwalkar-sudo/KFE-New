import assert from 'node:assert/strict'
import fs from 'node:fs'

const work = fs.readFileSync('src/views/WorkModuleView.vue', 'utf8')
const trace = fs.readFileSync('src/infrastructure/location/movementTraceService.js', 'utf8')
const location = fs.readFileSync('src/services/locationService.js', 'utf8')
const backup = fs.readFileSync('src/application/backup/backupService.js', 'utf8')

// Performance/battery contract: the 1 Hz UI clock must exist only for the
// passenger-trip timer, never as an always-on Work-screen heartbeat.
assert.match(work, /const startClock = \(\) =>/)
assert.match(work, /store\.isTripActive\) clock\.value = Date\.now\(\)/)
assert.match(work, /if\(store\.isTripActive\)startClock\(\)/)
assert.match(work, /startClock\(\); await KfeRideNotificationService\.startRide/)
assert.match(work, /stopClock\(\)\n  await KfeRideNotificationService\.completeRide/)

// GPS trace persistence is intentionally serialized so concurrent watch
// callbacks cannot create overlapping IndexedDB write transactions.
assert.match(trace, /let pendingWrites = Promise\.resolve\(\)/)
assert.match(trace, /pendingWrites = pendingWrites\.catch\(\(\) => \{\}\)\.then\(write\)/)
assert.match(trace, /DEAD_LEG: 20 \* 1000/)
assert.match(trace, /PASSENGER_RIDE: 20 \* 1000/)

// Background movement signals remain cheaper than persisted snapshots.
assert.match(location, /enableHighAccuracy: false/)
assert.match(location, /maximumAge: 30000/)
assert.match(location, /WAITING: 7 \* 60 \* 1000/)
assert.match(location, /TRIP_ACTIVE: 9 \* 60 \* 1000/)

// Backup checkpoints are debounced/coalesced rather than one full backup per
// mutation, protecting CPU, storage writes and battery during active use.
assert.match(backup, /checkpointTimer !== null/)
assert.match(backup, /setTimeout\(async \(\) =>/)
assert.match(backup, /checkpointRunning/)

console.log('KFE Phase 9 performance, battery and concurrency contract: PASS')
