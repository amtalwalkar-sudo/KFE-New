import assert from 'node:assert/strict'
import fs from 'node:fs'

const locationService = fs.readFileSync('src/application/location/locationNameService.js', 'utf8')
const eventLocationService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const locationRepository = fs.readFileSync('src/repositories/locationRepository.js', 'utf8')
const nativeStore = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java', 'utf8')
const nativePlugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkPlugin.java', 'utf8')
const nativeAdapter = fs.readFileSync('src/infrastructure/android/nativeCanonicalWork.js', 'utf8')
const canonicalBoundary = fs.readFileSync('src/application/work/canonicalWorkBoundary.js', 'utf8')
const browserCanonical = fs.readFileSync('src/infrastructure/work/browserCanonicalWork.js', 'utf8')
const workService = fs.readFileSync('src/application/work/workService.js', 'utf8')
const timelineView = fs.readFileSync('src/views/ActivityTimelineView.vue', 'utf8')
const timelineReadService = fs.readFileSync('src/application/timeline/activityTimelineReadService.js', 'utf8')

assert.ok(workService.includes("captureAndPersistEventLocation('TRIP', result.id, 'TRIP_START'"),
  'starting the passenger ride must use the shared event-location pathway')
assert.ok(workService.includes("captureAndPersistEventLocation('TRIP', data?.id, 'TRIP_END'"),
  'ending the passenger ride must use the shared event-location pathway')
assert.ok(workService.includes("captureAndPersistEventLocation('TRIP', result.id, 'PICKUP_START'"),
  'pickup-origin snapshot remains a distinct event in the same pathway')
assert.match(eventLocationService, /CanonicalWorkBoundary\.listEventLocationSnapshots\(\)/,
  'event location snapshots remain readable from native canonical storage')
assert.match(eventLocationService, /CanonicalWorkBoundary\.persistEventLocationSnapshot/,
  'captured trip/fuel locations remain durably mirrored into native canonical storage')
assert.match(locationService, /p\.suburb \|\| p\.neighbourhood \|\| p\.neighborhood \|\| p\.locality \|\| p\.district/,
  'locality fields should take precedence over street names')
assert.doesNotMatch(locationService, /return \[p\.name, p\.street/,
  'the visible formatter must not construct street-address labels')
assert.match(eventLocationService, /LocationRepository\.updatePlaceName\(snapshotId, placeName\)/, 'resolved labels must update the persisted GPS snapshot')
assert.match(eventLocationService, /CanonicalWorkBoundary\.persistEventLocationSnapshot/, 'resolved labels must use the shared canonical GPS snapshot write path')
assert.match(eventLocationService, /forEntities\(entityType, entityIds = \[\]\)/, 'Timeline must be able to read a batch of shared event snapshots')
assert.doesNotMatch(workService, /captureAndPersistTripBoundary|persistTripBoundarySnapshot/, 'trip boundaries must not use a separate persistence pathway')
assert.doesNotMatch(workService, /updateTripBoundaryPlaceName/, 'trip boundary labels must not use a separate metadata pathway')
assert.match(locationRepository, /notifyCanonicalDataChanged\(\{ stores: \['gps_snapshots', 'trips'\], reason: 'gps-place-name-enriched' \}\)/)
assert.match(timelineReadService, /EventLocationService\.forEntities\('TRIP', trips\.map\(trip => trip\?\.id\)\)/,
  'Timeline must read shared persisted GPS snapshots for its ride records')
assert.match(timelineReadService, /const locationLabel = snapshot =>/,
  'Timeline must show saved coordinates when locality enrichment is missing')
assert.match(timelineReadService, /GPS \$\{latitude\.toFixed\(5\)\}, \$\{longitude\.toFixed\(5\)\}/,
  'coordinate fallback must be human-readable and must not require internet')
assert.match(timelineView, /<span>Pickup area<\/span><strong>\{\{ ride\.pickupArea \}\}<\/strong>/,
  'the user-facing ride row must render the pickup locality')
assert.match(timelineView, /<span>Drop area<\/span><strong>\{\{ ride\.dropArea \}\}<\/strong>/,
  'the user-facing ride row must render the drop locality')
assert.match(timelineView, /subscribeDataChanges\(\(\) => \{ void load\(\) \}\)/,
  'Timeline must reload when a persisted locality label is enriched')
assert.match(timelineView, /onMounted\(\(\) => \{\s*void load\(\)/,
  'Timeline must load the locality read model when mounted')


assert.match(fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8'), /putRecord\(operationId,"GPS_SNAPSHOT",snapshot\)/, 'native overlay must write locality metadata through the shared GPS snapshot entity')
assert.match(timelineReadService, /pickupAreaResolution:/, 'read-only Timeline exposes saved locality state')
assert.match(timelineView, /Area lookup will retry/, 'Timeline communicates unresolved locality enrichment')
assert.match(locationService, /LocalityResolutionService/, 'location service exposes a shared provider-independent resolver')

console.log('PASS: Activity Timeline ride/fuel locality enrichment uses the shared event snapshot pathway')
