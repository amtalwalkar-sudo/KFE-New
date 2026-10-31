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
assert.match(eventLocations, /EventLocalityService\.resolveSnapshot/)
assert.match(eventLocations, /resolveNativeSnapshotAfterCapture/)
assert.doesNotMatch(tripBoundary, /watchPosition|setInterval|routeTrace|fetch\(/)
assert.match(overlay, /requestLocationUpdates\(provider,3000L,0f/)
assert.match(overlay, /handler\.postDelayed\(stop,30000L/)
assert.match(overlay, /removeUpdates\(this\)/)
assert.doesNotMatch(overlay, /startLocationUpdates|routeTrace|calculateTraceDistanceKm/)
assert.doesNotMatch(workRecords, /tripKmAuthority|tripKm:\s*normalized/)
assert.match(timeline, /refreshLocationNames/)
assert.match(timeline, /EventLocalityService\.resolveSnapshots\(eligible\)/)
assert.match(timeline, /Pull down to resolve unsaved GPS locality names from the last seven days when online/)
console.log('Event GPS contract: four offline event snapshots, bounded retries, asynchronous seven-day locality resolution, and no route tracking or ride-distance calculation.')
