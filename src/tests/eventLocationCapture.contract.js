import assert from 'node:assert/strict'
import fs from 'node:fs'

const workService = fs.readFileSync('src/application/work/workService.js', 'utf8')
const locationRepository = fs.readFileSync('src/repositories/locationRepository.js', 'utf8')
const eventLocationService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const geocoder = fs.readFileSync('src/application/location/locationNameService.js', 'utf8')

for (const hook of [
  "captureAndPersistEventLocation('SHIFT', result.id, 'SHIFT_START')",
  "captureAndPersistEventLocation('SHIFT', active.shift.id, 'SHIFT_END')",
  "captureAndPersistEventLocation('FUEL', result.record.id, 'FUEL_ENTRY')"
]) assert.ok(workService.includes(hook), `Missing async location hook: ${hook}`)

assert.match(workService, /EventLocationService\.captureForEvent\(entityType, entityId, eventType\)/)
assert.match(eventLocationService, /void \(async \(\) => \{/,
  'GPS capture must run fire-and-forget, outside the authoritative work transition')
assert.match(eventLocationService, /await LocationRepository\.record\(/,
  'coordinates must be persisted locally before reverse geocoding')
assert.match(eventLocationService, /await resolveLocationName\(location, locationNameResolver\)/,
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

console.log('PASS: shift/fuel location capture is optional, async, and persisted before geocoding')
