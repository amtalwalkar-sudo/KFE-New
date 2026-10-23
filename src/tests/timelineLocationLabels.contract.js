import assert from 'node:assert/strict'
import fs from 'node:fs'

const timeline = fs.readFileSync('src/views/ActivityTimelineView.vue', 'utf8')
const locationService = fs.readFileSync('src/application/location/locationNameService.js', 'utf8')
const eventLocationService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const locationRepository = fs.readFileSync('src/repositories/locationRepository.js', 'utf8')
const nativeStore = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java', 'utf8')
const nativePlugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkPlugin.java', 'utf8')
const nativeAdapter = fs.readFileSync('src/infrastructure/android/nativeCanonicalWork.js', 'utf8')
const canonicalBoundary = fs.readFileSync('src/application/work/canonicalWorkBoundary.js', 'utf8')
const browserCanonical = fs.readFileSync('src/infrastructure/work/browserCanonicalWork.js', 'utf8')
const workService = fs.readFileSync('src/application/work/workService.js', 'utf8')

assert.match(timeline, /void loadLabels\(data\.value\.trips\)/,
  'ride locality enrichment must run asynchronously after persisted Timeline data is loaded')
assert.ok(timeline.includes("EventLocationService.forEntity('TRIP',trip.id)"), 'Timeline must read persisted trip-boundary event snapshots')
assert.match(timeline, /EventLocationService\.resolveLabel\(pickup\)/,
  'pickup-origin locality should be resolved through the application service')
assert.match(timeline, /tripStartLocation/,'ride cards must read the persisted trip-start boundary')
assert.match(timeline, /tripEndLocation/,'ride cards must read the persisted trip-end boundary')
assert.ok(timeline.includes("EventLocationService.persistTripBoundaryLabel(trip.id,field,name)"), 'resolved trip locality labels must be persisted beyond component state')
assert.match(timeline, /void loadFuelLabels\(data\.value\.fuel\)/,
  'fuel locality enrichment must not block Timeline rendering')
assert.ok(timeline.includes("EventLocationService.forEntity('FUEL',row.id)"), 'fuel Timeline must read saved fuel-entry location snapshots')
assert.ok(timeline.includes("EventLocationService.persistLabel(snapshot.id,name)"), 'resolved fuel locality labels must be persisted for future Timeline reads')
assert.match(workService, /captureAndPersistTripBoundary\(result\.id, 'tripStartLocation'\)/,
  'starting the passenger ride must trigger a one-shot start GPS snapshot')
assert.match(workService, /captureAndPersistTripBoundary\(data\?\.id, 'tripEndLocation'\)/,
  'completing or cancelling a ride must trigger a one-shot end GPS snapshot')
assert.match(workService, /captureAndPersistEventLocation\('TRIP', result\.id, 'PICKUP_START', result\.createdAt \|\| result\.tripStartAt\)/,
  'pickup-origin snapshot must be captured separately from passenger ride start')
assert.match(eventLocationService, /CanonicalWorkBoundary\.listEventLocationSnapshots\(\)/,
  'Timeline enrichment should recover snapshots from native canonical storage')
assert.match(eventLocationService, /CanonicalWorkBoundary\.persistEventLocationSnapshot/,
  'captured trip/fuel locations should be durably mirrored into native canonical storage')
assert.match(locationService, /p\.suburb \|\| p\.neighbourhood \|\| p\.neighborhood \|\| p\.locality \|\| p\.district/,
  'locality fields should take precedence over street names')
assert.doesNotMatch(locationService, /return \[p\.name, p\.street/,
  'the visible formatter must not construct street-address labels')
assert.match(eventLocationService, /LocationRepository\.updatePlaceName\(snapshotId, placeName\)/)
assert.match(eventLocationService, /CanonicalWorkBoundary\.updateTripBoundaryPlaceName/,
  'trip locality persistence must go through the canonical application boundary')
assert.match(nativeAdapter, /NativeCanonicalWork\.updateTripBoundaryPlaceName/,
  'Android adapter must invoke native durable metadata update')
assert.match(browserCanonical, /async updateTripBoundaryPlaceName\(/, 'browser PWA must persist locality labels in its canonical trip store')
assert.match(canonicalBoundary, /BrowserCanonicalWorkService\.updateTripBoundaryPlaceName/, 'application boundary must persist locality labels outside native Android too')
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
assert.match(nativeStore, /previous\.optString\("placeName", ""\)/,
  'replayed metadata operations must be checked against their original label for idempotency')
assert.match(locationRepository, /notifyCanonicalDataChanged\(\{ stores: \['gps_snapshots', 'trips'\], reason: 'gps-place-name-enriched' \}\)/)

console.log('PASS: Activity Timeline ride/fuel locality enrichment is shared, persisted, and non-blocking')
