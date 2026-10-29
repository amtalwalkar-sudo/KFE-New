import assert from 'node:assert/strict'
import fs from 'node:fs'

const workService = fs.readFileSync('src/application/work/workService.js', 'utf8')
const locationRepository = fs.readFileSync('src/repositories/locationRepository.js', 'utf8')
const eventLocationService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const geocoder = fs.readFileSync('src/application/location/locationNameService.js', 'utf8')
const nativeBoundaryPlugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeTripBoundaryLocationPlugin.java', 'utf8')
const nativeOverlay = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8')

for (const hook of [
  "captureAndPersistEventLocation('SHIFT', result.id, 'SHIFT_START', result.shiftStartAt || result.createdAt)",
  "captureAndPersistEventLocation('TRIP', result.id, 'PICKUP_START', result.createdAt || result.tripStartAt)",
  "captureAndPersistEventLocation('TRIP', result.id, 'TRIP_START', result.tripStartAt || new Date().toISOString())",
  "captureAndPersistEventLocation('TRIP', data?.id, 'TRIP_END', data?.tripEndAt || new Date().toISOString())",
  "captureAndPersistEventLocation('SHIFT', active.shift.id, 'SHIFT_END', completedShift?.shiftEndAt || null)",
  "captureAndPersistEventLocation('FUEL', result.record.id, 'FUEL_ENTRY', result.record.createdAt || result.record.capturedAt)"
]) assert.ok(workService.includes(hook), `Missing async location hook: ${hook}`)

assert.match(workService, /EventLocationService\.captureForEvent\(entityType, entityId, eventType, eventAt\)/)
assert.match(eventLocationService, /void \(async \(\) => \{/,
  'GPS capture must run fire-and-forget, outside the authoritative work transition')
assert.match(workService, /captureAndPersistEventLocation\('FUEL', result\.record\.id, 'FUEL_ENTRY', result\.record\.createdAt \|\| result\.record\.capturedAt\)/,
  'fuel location snapshots must retain the fuel event timestamp')
assert.match(locationRepository, /eventAt: eventAt == null/,
  'the business event timestamp must remain separate from the provider fix timestamp')
assert.match(eventLocationService, /await LocationRepository\.record\(/,
  'coordinates must be persisted locally before reverse geocoding')
assert.match(eventLocationService, /await resolveLocationNameWithRetry\(snapshot, locationNameResolver\)/,
  'reverse geocoding must be a follow-up enrichment')
assert.match(locationRepository, /GPS snapshot requires the location provider fix timestamp/,
  'GPS snapshots must reject missing provider timestamps rather than substitute event wall-clock time')
assert.match(locationRepository, /capturedAt: new Date\(fixTimestamp\)\.toISOString\(\)/,
  'GPS snapshot must persist the normalized provider fix timestamp')
assert.match(eventLocationService, /CanonicalWorkBoundary\.persistEventLocationSnapshot/,
  'event location snapshots must be mirrored into native canonical storage')
assert.match(eventLocationService, /CanonicalWorkBoundary\.listEventLocationSnapshots/,
  'timeline reads must be able to recover event snapshots from native canonical storage')
assert.match(eventLocationService, /await this\.persistNativeSnapshot\(local\)/,
  'locality label enrichment must be mirrored durably to native storage')
assert.match(locationRepository, /id = null/,
  'the same event snapshot identity must be shared across browser and native stores')
assert.match(geocoder, /Display area\/locality names only/,
  'the formatter must explicitly define locality-only visible labels')
assert.doesNotMatch(geocoder, /return \[p\.name, p\.street/,
  'street addresses must not be used as visible location labels')

assert.match(workService, /captureAndPersistEventLocation\('TRIP', result\.id, 'TRIP_START'/, 'passenger ride start must use the shared event-location pathway')
assert.match(workService, /captureAndPersistEventLocation\('TRIP', data\?\.id, 'TRIP_END'/, 'passenger ride end must use the shared event-location pathway')
assert.match(eventLocationService, /if \(!String\(prior\.placeName \|\| ''\)\.trim\(\)\)/, 'existing snapshots without locality labels must retry enrichment without recapturing GPS')
assert.match(eventLocationService, /async reconcilePersistedTripLocations\(\)/, 'startup reconciliation must migrate old trip-boundary snapshots into the shared event model')
assert.match(eventLocationService, /legacy-trip-location-/, 'legacy migration must use a stable identity and avoid duplicate snapshots')
assert.match(eventLocationService, /resolveLocationNameWithRetry\(snapshot, locationNameResolver\)/, 'persisted snapshots without locality labels must be enriched without another GPS capture')
assert.match(locationRepository, /gps-snapshot-created/, 'creating a GPS snapshot must notify subscribed read models')
const appEntry = fs.readFileSync('src/main.js', 'utf8')
assert.match(appEntry, /EventLocationService\.reconcilePersistedTripLocations\(\)/, 'location migration/enrichment must run outside the read-only Timeline')
console.log('PASS: all work-event locations use one optional, async, persisted-before-geocoding pathway')

assert.match(nativeBoundaryPlugin, /"SHIFT_START".equals(eventType)[\s\S]*"SHIFT_END".equals(eventType)/,
  'shift start and end must use the permission-gated native GPS retry queue')
assert.match(nativeOverlay, /queueEventLocationCapture\(Context context,String entityType,String entityId,String eventType,String eventAt\)/,
  'native event GPS queue must preserve the generic event identity and timestamp')
assert.match(nativeOverlay, /eventLocationSnapshotId\(entityType,entityId,eventType\)/,
  'native retries must persist GPS snapshots under a stable entity/event identity')
