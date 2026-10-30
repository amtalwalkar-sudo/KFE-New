import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const overlay = read('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java')
const tripBoundary = read('src/application/work/tripBoundaryLocation.js')
const eventLocations = read('src/application/location/eventLocationService.js')
const workService = read('src/application/work/workService.js')
const timeline = read('src/views/ActivityTimelineView.vue')
const workRecords = read('src/domain/work/canonicalWorkRecords.js')

for (const event of ['PICKUP_START','TRIP_CANCELLED','TRIP_START','TRIP_END']) {
  assert.ok(overlay.includes(`\"${event}\"`), `Native overlay must capture the ${event} event.`)
}
assert.match(workService, /captureAndPersistEventLocation\('TRIP', result\.id, 'TRIP_START'/)
assert.match(workService, /captureAndPersistEventLocation\('TRIP', data\?\.id, 'TRIP_END'/)
assert.match(eventLocations, /WorkRuntimePorts\.tripBoundaryLocation\.captureOneShotLocation/)
assert.doesNotMatch(eventLocations, /ConnectivityService|resolveLocationName|locality|enrichment/i)
assert.doesNotMatch(tripBoundary, /watchPosition|setInterval|routeTrace|fetch\(/)
assert.doesNotMatch(overlay, /requestLocationUpdates|startLocationUpdates|routeTrace|calculateTraceDistanceKm/)
assert.doesNotMatch(workRecords, /tripKmAuthority|tripKm:\s*normalized/)
assert.match(timeline, /refreshLocationNames/)
assert.match(timeline, /resolveLocationNameDetailed\(location, undefined, \{ forceRefresh: true \}\)/)
assert.match(timeline, /Pull down from the top to refresh area names when online/)
console.log('Event GPS-only contract: four one-shot offline ride snapshots; locality lookup is manual-only; no route tracking or ride-distance calculation.')
