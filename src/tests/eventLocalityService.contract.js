import assert from 'node:assert/strict'
import fs from 'node:fs'
import { isEligibleForLocalityResolution, LOCALITY_RESOLUTION_MAX_AGE_MS } from '../application/location/eventLocalityService.js'
import { EVENT_GPS_CAPTURE_WINDOW_MS, isValidEventGpsTimestamp } from '../domain/location/eventGpsPolicy.js'

const now = Date.parse('2026-10-31T12:00:00.000Z')
assert.equal(LOCALITY_RESOLUTION_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000)
assert.equal(EVENT_GPS_CAPTURE_WINDOW_MS, 30_000)
assert.equal(isValidEventGpsTimestamp(new Date(now).toISOString(), new Date(now + 29_999).toISOString()), true)
assert.equal(isValidEventGpsTimestamp(new Date(now).toISOString(), new Date(now + 30_000).toISOString()), false)
assert.equal(isValidEventGpsTimestamp(new Date(now).toISOString(), new Date(now - 1).toISOString()), false)
const eligibleSnapshot = (eventType, eventAt) => ({
  id: 'gps-' + eventType, eventType, eventAt,
  capturedAt: Number.isFinite(Date.parse(eventAt || '')) ? new Date(Date.parse(eventAt) + 1000).toISOString() : null,
  latitude: 19.076, longitude: 72.8777, accuracy: 30,
})
for (const eventType of ['PICKUP_START', 'TRIP_START', 'TRIP_END', 'TRIP_CANCELLED']) {
  assert.equal(isEligibleForLocalityResolution(eligibleSnapshot(eventType, new Date(now - 1000).toISOString()), now), true,
    eventType + ' with a valid fix must be geocoded')
  assert.equal(isEligibleForLocalityResolution(eligibleSnapshot(eventType, new Date(now - LOCALITY_RESOLUTION_MAX_AGE_MS).toISOString()), now), true,
    eventType + ' at the seven-day boundary remains eligible')
  assert.equal(isEligibleForLocalityResolution(eligibleSnapshot(eventType, new Date(now - LOCALITY_RESOLUTION_MAX_AGE_MS - 1).toISOString()), now), false,
    eventType + ' older than seven days must not be sent to a provider')
}
assert.equal(isEligibleForLocalityResolution({ ...eligibleSnapshot('TRIP_START', new Date(now - 1000).toISOString()), accuracy: null }, now), false,
  'GPS fixes without recorded accuracy must not be sent to a locality provider')
assert.equal(isEligibleForLocalityResolution({ ...eligibleSnapshot('TRIP_START', new Date(now - 1000).toISOString()), accuracy: 75.01 }, now), false,
  'GPS fixes worse than 75 metres must not be sent to a locality provider')
assert.equal(isEligibleForLocalityResolution({ ...eligibleSnapshot('TRIP_START', new Date(now - 1000).toISOString()), latitude: 91 }, now), false,
  'Invalid coordinates must not be sent to a locality provider')
assert.equal(isEligibleForLocalityResolution({ eventType: 'TRIP_START', eventAt: new Date(now + 1).toISOString() }, now), false)
assert.equal(isEligibleForLocalityResolution({ eventType: 'LOCATION_POLL', eventAt: new Date(now - 1000).toISOString() }, now), false)
assert.equal(isEligibleForLocalityResolution({ eventType: 'TRIP_END', eventAt: null }, now), false)
assert.equal(isEligibleForLocalityResolution({
  ...eligibleSnapshot('TRIP_START', new Date(now - 1000).toISOString()),
  capturedAt: new Date(now + 29_000).toISOString(),
}, now), false, 'A provider fix at or beyond the 30-second event-time boundary must not be geocoded.')
assert.equal(isEligibleForLocalityResolution({
  ...eligibleSnapshot('TRIP_START', new Date(now - 1000).toISOString()),
  capturedAt: new Date(now - 1001).toISOString(),
}, now), false, 'A provider fix from before the event must not be geocoded.')

const repository = fs.readFileSync('src/repositories/localityRepository.js', 'utf8')
const captureService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const localityService = fs.readFileSync('src/application/location/eventLocalityService.js', 'utf8')
const timeline = fs.readFileSync('src/views/ActivityTimelineView.vue', 'utf8')
assert.match(captureService, /if \(prior\) return/)
assert.match(localityService, /WorkRuntimePorts\.platform\.isOnline\(\)/)
assert.match(localityService, /isValidEventGpsTimestamp/)
assert.match(localityService, /accuracy <= 75/, 'Locality resolution must require a recorded GPS accuracy of 75 metres or better.')
assert.doesNotMatch(localityService, /navigator\.onLine/)
assert.doesNotMatch(timeline, /navigator\.onLine/, 'Timeline presentation must not bypass the platform connectivity adapter.')
assert.match(timeline, /results\.some\(result => result\?\.state === 'OFFLINE'\)/, 'Timeline must render offline state from the locality service result.')
assert.doesNotMatch(captureService, /if \(prior\)[^\n]*resolveSnapshot/)
assert.match(timeline, /EventLocationService\.allSnapshots\(\)/)
const adapter = fs.readFileSync('src/infrastructure/location/localityResolutionAdapter.js', 'utf8')
assert.match(repository, /snapshotId, placeName/)
assert.match(repository, /store\.add\(saved\)/)
assert.match(repository, /Successful labels are immutable/)
assert.doesNotMatch(adapter, /localStorage|CACHE_KEY|slice\(0,500\)/)
console.log('PASS: all four GPS event types resolve only within seven days and successful labels are permanent per snapshot ID')
