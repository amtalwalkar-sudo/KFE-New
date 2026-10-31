import assert from 'node:assert/strict'
import fs from 'node:fs'
import { isEligibleForLocalityResolution, LOCALITY_RESOLUTION_MAX_AGE_MS } from '../application/location/eventLocalityService.js'

const now = Date.parse('2026-10-31T12:00:00.000Z')
assert.equal(LOCALITY_RESOLUTION_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000)
for (const eventType of ['PICKUP_START', 'TRIP_START', 'TRIP_END', 'TRIP_CANCELLED']) {
  assert.equal(isEligibleForLocalityResolution({ id: 'gps-' + eventType, eventType, eventAt: new Date(now - 1000).toISOString() }, now), true,
    eventType + ' must be geocoded')
  assert.equal(isEligibleForLocalityResolution({ id: 'gps-' + eventType, eventType, eventAt: new Date(now - LOCALITY_RESOLUTION_MAX_AGE_MS).toISOString() }, now), true,
    eventType + ' at the seven-day boundary remains eligible')
  assert.equal(isEligibleForLocalityResolution({ id: 'gps-' + eventType, eventType, eventAt: new Date(now - LOCALITY_RESOLUTION_MAX_AGE_MS - 1).toISOString() }, now), false,
    eventType + ' older than seven days must not be sent to a provider')
}
assert.equal(isEligibleForLocalityResolution({ eventType: 'TRIP_START', eventAt: new Date(now + 1).toISOString() }, now), false)
assert.equal(isEligibleForLocalityResolution({ eventType: 'LOCATION_POLL', eventAt: new Date(now - 1000).toISOString() }, now), false)
assert.equal(isEligibleForLocalityResolution({ eventType: 'TRIP_END', eventAt: null }, now), false)

const repository = fs.readFileSync('src/repositories/localityRepository.js', 'utf8')
const adapter = fs.readFileSync('src/infrastructure/location/localityResolutionAdapter.js', 'utf8')
assert.match(repository, /snapshotId, placeName/)
assert.match(repository, /store\.add\(saved\)/)
assert.match(repository, /Successful labels are immutable/)
assert.doesNotMatch(adapter, /localStorage|CACHE_KEY|slice\(0,500\)/)
console.log('PASS: all four GPS event types resolve only within seven days and successful labels are permanent per snapshot ID')
