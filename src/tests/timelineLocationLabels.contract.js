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

assert.match(workService, /captureAndPersistEventLocation\\('TRIP', result\\.id, 'TRIP_START'/,
  'starting the passenger ride must use the shared event-location pathway')
assert.match(workService, /captureAndPersistEventLocation\\('TRIP', data\\?\\.id, 'TRIP_END'/,
  'ending the passenger ride must use the shared event-location pathway')
assert.match(workService, /captureAndPersistEventLocation\\('TRIP', result\\.id, 'PICKUP_START'/,
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

assert.match(nativeStore, /GPS_SNAPSHOT/, 'native canonical storage must support the shared event snapshot entity')
console.log('PASS: Activity Timeline ride/fuel locality enrichment uses the shared event snapshot pathway')
