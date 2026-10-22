import assert from 'node:assert/strict'
import fs from 'node:fs'

const workService = fs.readFileSync('src/application/work/workService.js', 'utf8')
const locationRepository = fs.readFileSync('src/repositories/locationRepository.js', 'utf8')
const geocoder = fs.readFileSync('src/services/locationNameService.js', 'utf8')

for (const hook of [
  "captureAndPersistEventLocation('SHIFT', result.id, 'SHIFT_START')",
  "captureAndPersistEventLocation('SHIFT', active.shift.id, 'SHIFT_END')",
  "captureAndPersistEventLocation('FUEL', result.record.id, 'FUEL_ENTRY')"
]) assert.ok(workService.includes(hook), `Missing async location hook: ${hook}`)

assert.match(workService, /const captureAndPersistEventLocation = \(entityType, entityId, eventType\) =>/)
assert.match(workService, /void \(async \(\) => \{/,
  'GPS capture must run fire-and-forget, outside the authoritative work transition')
assert.match(workService, /await LocationRepository\.record\(/,
  'coordinates must be persisted locally before reverse geocoding')
assert.match(workService, /await resolveLocationName\(location, locationNameResolver\)/,
  'reverse geocoding must be a follow-up enrichment')
assert.match(locationRepository, /capturedAt: capturedAt \|\| now/,
  'location snapshot must retain the provider timestamp when supplied')
assert.match(geocoder, /p\.street/,
  'the formatter may inspect street fields only to exclude them from visible labels')
assert.doesNotMatch(geocoder, /return \[p\.name, p\.street/,
  'street addresses must not be used as visible location labels')

console.log('PASS: shift/fuel location capture is optional, async, and persisted before geocoding')
