import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizeTripBoundaryLocation } from '../application/work/tripBoundaryLocation.js'

const valid = normalizeTripBoundaryLocation({ latitude: 19.076, longitude: 72.8777, accuracy: 12, capturedAt: '2026-10-22T05:30:00.000Z' })
assert.equal(valid.capturedAt, '2026-10-22T05:30:00.000Z', 'the original GPS fix timestamp must be preserved')
assert.equal(valid.latitude, 19.076)
assert.equal(valid.longitude, 72.8777)
assert.equal(normalizeTripBoundaryLocation({ latitude: 19.076, longitude: 72.8777, accuracy: -1, capturedAt: '2026-10-22T05:30:00.000Z' }), null, 'negative GPS accuracy must make the fix unavailable so the pending event can retry')
assert.deepEqual(normalizeTripBoundaryLocation({ latitude: 19.076, longitude: 72.8777, capturedAt: '2026-10-22T05:30:00.000Z' }), { latitude: 19.076, longitude: 72.8777, accuracy: null, capturedAt: '2026-10-22T05:30:00.000Z' }, 'provider accuracy is optional metadata')
assert.equal(normalizeTripBoundaryLocation({ latitude: 91, longitude: 72.8777, capturedAt: '2026-10-22T05:30:00.000Z' }), null, 'out-of-range GPS coordinates must be rejected')
assert.equal(normalizeTripBoundaryLocation({ latitude: 19.076, longitude: 72.8777 }), null, 'a location without a fix timestamp must not receive a fabricated current timestamp')
assert.equal(normalizeTripBoundaryLocation({ latitude: 19.076, longitude: 72.8777, capturedAt: 'not-a-date' }), null, 'an invalid fix timestamp must make the snapshot unavailable')
assert.equal(normalizeTripBoundaryLocation({ latitude: 19.076, longitude: 72.8777, capturedAt: 0 }), null, 'a non-positive fix timestamp must not be treated as a real GPS fix time')

const repository = fs.readFileSync('src/repositories/shiftTripRepository.js', 'utf8')
assert.doesNotMatch(repository, /capturedAt:\s*location\.capturedAt\s*\|\|\s*now/, 'repository must never fabricate a GPS fix timestamp')
assert.match(repository, /const fixDate = new Date\(location\.capturedAt\)/, 'repository must validate the actual provider timestamp')
assert.match(repository, /fixDate\.getTime\(\) <= 0/, 'repository must reject missing or non-positive fix timestamps')

const plugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeTripBoundaryLocationPlugin.java', 'utf8')
assert.doesNotMatch(plugin, /captureCurrentLocation/, 'Android GPS must use only the durable native event queue')
assert.doesNotMatch(plugin, /location\.getTime\(\) > 0L \? location\.getTime\(\) : System\.currentTimeMillis\(\)/, 'native snapshot must never replace fix time with current time')
console.log('PASS: trip-boundary snapshots preserve only actual GPS fix timestamps')

const workService = fs.readFileSync('src/application/work/workService.js', 'utf8')
const fuelRepository = fs.readFileSync('src/repositories/fuelRepository.js', 'utf8')
const nativeOverlay = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8')
const nativeLocation = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java', 'utf8')
const fuelFlow = fs.readFileSync('src/application/work/fuel.js', 'utf8')

assert.match(workService, /transitionTripStage\(trip, 'RIDE_STARTED', \{ at: new Date\(\)\.toISOString\(\) \}\)/, 'PWA ride-start business timestamp must be captured at the transition')
assert.match(workService, /next\.tripEndAt = data\.tripEndAt \|\| trip\.tripEndAt \|\| now/, 'PWA trip-end timestamp must be retained or assigned at completion')
assert.match(nativeOverlay, /trip\.put\("tripStartAt",new java\.util\.Date\(tripStartAt\)\.toInstant\(\)\.toString\(\)\)/, 'native trip-start timestamp must use the persisted start instant')
assert.match(nativeOverlay, /trip\.put\("tripEndAt",eventTimestamp\)/, 'native trip-end timestamp must use the durable lifecycle event timestamp')
assert.match(nativeOverlay, /location\.getTime\(\)/, 'native GPS snapshots must use the provider fix timestamp')
assert.match(nativeOverlay, /location\.getTime\(\)/, 'native GPS snapshots must use the provider fix timestamp')
assert.match(fuelRepository, /capturedAt: normalized\.capturedAt \|\| now, createdAt: normalized\.createdAt \|\| now/, 'fuel entry event time and record creation time must be stored independently')
assert.match(fuelRepository, /capturedAt: existing\.capturedAt/, 'fuel corrections must preserve the original fuel-entry timestamp')
assert.match(fuelFlow, /FuelRepository\.create\(\{ \.\.\.validation, vehicleId \}\)/, 'fuel save must commit without waiting for optional GPS')
assert.doesNotMatch(workService, /watchPosition\s*\(/, 'trip-boundary implementation must not add continuous browser GPS tracking')
assert.doesNotMatch(nativeOverlay, /requestLocationUpdates\s*\(/, 'native overlay must not add continuous GPS tracking')
console.log('PASS: GPS coordinates/accuracy and shift-trip-fuel timestamps retain their correct event/provider semantics')
