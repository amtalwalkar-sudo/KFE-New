import assert from 'node:assert/strict'
import fs from 'node:fs'

const workService = fs.readFileSync('src/application/work/workService.js', 'utf8')
const locationRepository = fs.readFileSync('src/repositories/locationRepository.js', 'utf8')
const eventLocationService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const boundary = fs.readFileSync('src/application/work/tripBoundaryLocation.js', 'utf8')
const nativePlugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeTripBoundaryLocationPlugin.java', 'utf8')
const nativeOverlay = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8')

for (const event of ['PICKUP_START', 'TRIP_CANCELLED', 'TRIP_START', 'TRIP_END']) {
  assert.ok(eventLocationService.includes(`'${event}'`), `missing supported ride event ${event}`)
  assert.ok(nativePlugin.includes(`"${event}".equals(eventType)`), `native queue must accept ${event}`)
  assert.ok(workService.includes(`captureAndPersistEventLocation('TRIP'`), 'ride workflow must use the shared capture entry point')
}
assert.match(workService, /captureAndPersistEventLocation\('TRIP', result\.id, 'PICKUP_START'/)
assert.match(workService, /captureAndPersistEventLocation\('TRIP', result\.id, 'TRIP_START'/)
assert.match(workService, /captureAndPersistEventLocation\('TRIP', data\?\.id, 'TRIP_END'/)
assert.match(workService, /captureAndPersistEventLocation\('TRIP', data\?\.id, 'TRIP_CANCELLED'/)
assert.doesNotMatch(workService, /captureAndPersistEventLocation\('(SHIFT|FUEL)'/, 'GPS capture is limited to the four ride events')
assert.match(eventLocationService, /queueTripBoundaryEventLocation\(entityType, entityId, eventType, eventAt\)/)
assert.match(eventLocationService, /captureTripBoundaryLocation\(\)/)
assert.match(eventLocationService, /LocationRepository\.record\(/)
assert.match(locationRepository, /GPS snapshot requires the location provider fix timestamp/)
assert.match(locationRepository, /capturedAt: new Date\(fixTimestamp\)\.toISOString\(\)/)
assert.match(eventLocationService, /CanonicalWorkBoundary\.persistEventLocationSnapshot/)
assert.match(eventLocationService, /CanonicalWorkBoundary\.listEventLocationSnapshots/)
assert.doesNotMatch(eventLocationService, /LocalityResolutionService|resolveLocationName|ConnectivityService|LOCATION_ENRICHMENT|LOCATION_RECONCILIATION|reconcilePersistedTripLocations|refreshUnresolvedLocationNames/)
assert.match(boundary, /maximumAge: 0/)
assert.match(nativeOverlay, /queueEventLocationCapture\(Context context,String entityType,String entityId,String eventType,String eventAt\)/)
assert.match(nativeOverlay, /eventLocationSnapshotId\(entityType,entityId,eventType\)/)
assert.match(nativePlugin, /backgroundCaptureAllowed/)
console.log('PASS: four ride events use one offline-first one-shot GPS snapshot pathway')
