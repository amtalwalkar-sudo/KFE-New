import assert from 'node:assert/strict'
import fs from 'node:fs'

const timeline = fs.readFileSync('src/views/TimelineView.vue', 'utf8')
const locationService = fs.readFileSync('src/application/location/locationNameService.js', 'utf8')
const eventLocationService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const locationRepository = fs.readFileSync('src/repositories/locationRepository.js', 'utf8')
const nativeStore = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java', 'utf8')
const nativePlugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkPlugin.java', 'utf8')
const nativeAdapter = fs.readFileSync('src/infrastructure/android/nativeCanonicalWork.js', 'utf8')
const canonicalBoundary = fs.readFileSync('src/application/work/canonicalWorkBoundary.js', 'utf8')

assert.match(timeline, /void resolveTimelineLocationLabels\(data\.value\)\.catch\(\(\) => \{\}\)/,
  'timeline location enrichment must not delay rendering')
assert.match(timeline, /EventLocationService\.resolveLabel\(location\)/,
  'trip boundary labels should use the application service')
assert.match(timeline, /locationLabelFor\('FUEL', event\.record\.id, 'FUEL_ENTRY'\)/,
  'fuel timeline should show its resolved locality label')
assert.match(timeline, /EventLocationService\.persistLabel\(snapshot\.id, name\)/,
  'resolved names should be persisted for future timeline reads')
assert.match(locationService, /p\.suburb \|\| p\.neighbourhood \|\| p\.neighborhood \|\| p\.locality \|\| p\.district/,
  'locality fields should take precedence over street names')
assert.doesNotMatch(locationService, /return \[p\.name, p\.street/,
  'the visible formatter must not construct street-address labels')
assert.match(eventLocationService, /LocationRepository\.updatePlaceName\(snapshotId, placeName\)/)
assert.match(timeline, /EventLocationService\.persistTripBoundaryLabel\(record\.id, side === 'start' \? 'tripStartLocation' : 'tripEndLocation', name\)/,
  'resolved trip labels must be persisted through the application boundary')
assert.match(eventLocationService, /CanonicalWorkBoundary\.updateTripBoundaryPlaceName/,
  'event location service must delegate trip label persistence to canonical boundary')
assert.match(nativeAdapter, /NativeCanonicalWork\.updateTripBoundaryPlaceName/,
  'Android adapter must invoke native durable metadata update')
assert.match(canonicalBoundary, /WorkRuntimePorts\.canonicalWork\.updateTripBoundaryPlaceName/,
  'application boundary must use the canonical runtime port')
assert.match(nativePlugin, /updateTripBoundaryPlaceName\(PluginCall call\)/,
  'Capacitor plugin must expose the native metadata operation')
assert.match(nativeStore, /UPDATE_TRIP_BOUNDARY_PLACE_NAME/,
  'native storage must record an idempotent metadata operation')
assert.match(nativeStore, /A durable GPS boundary snapshot is required before adding its locality label/,
  'metadata update must not fabricate missing coordinates')
assert.match(nativeStore, /Intentionally leave the canonical business updatedAt unchanged/,
  'metadata enrichment must not mutate business version or fare workflow')
assert.match(nativeStore, /incoming\.put\(field, existing\.get\(field\)\)/,
  'a stale PWA mirror must retain the native snapshot and its resolved label during synchronization')
assert.match(nativeStore, /JSONObject getRecord\(String entityType, String entityId\)/,
  'a fresh application read must reload the persisted canonical trip after metadata enrichment')
assert.match(nativeStore, /db\.insertWithOnConflict\("canonical_records", null, recordValues, SQLiteDatabase\.CONFLICT_REPLACE\)/,
  'resolved labels must be written to durable canonical storage, not only Timeline component state')
assert.match(nativeStore, /previous\\.optString\\("placeName", ""\\)/,
  'replayed metadata operations must be checked against their original label for idempotency')
assert.match(locationRepository, /notifyCanonicalDataChanged\(\{ stores: \['gps_snapshots', 'trips'\], reason: 'gps-place-name-enriched' \}\)/)

console.log('PASS: timeline locality enrichment is shared, persisted, and non-blocking')
