import assert from 'node:assert/strict'
import fs from 'node:fs'

const eventLocationService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const timelineView = fs.readFileSync('src/views/ActivityTimelineView.vue', 'utf8')
const readService = fs.readFileSync('src/application/timeline/activityTimelineReadService.js', 'utf8')
const boundary = fs.readFileSync('src/application/work/tripBoundaryLocation.js', 'utf8')

assert.match(eventLocationService, /async forEntities\(entityType, entityIds = \[\]\)/)
assert.match(eventLocationService, /CanonicalWorkBoundary\.listEventLocationSnapshots\(\)/)
assert.match(readService, /EventLocationService\.forEntities\('TRIP', trips\.map\(trip => trip\?\.id\)\)/)
assert.match(readService, /if \(snapshot\.eventType === 'PICKUP_START'\) current\.pickup = snapshot/)
assert.match(readService, /const pickupName = locationLabel\(locations\.pickup\)/)
assert.match(readService, /const dropName = locationLabel\(locations\.end\)/)
assert.match(readService, /GPS \$\{latitude\.toFixed\(5\)\}, \$\{longitude\.toFixed\(5\)\}/)
assert.doesNotMatch(readService, /trip\.tripStartLocation|trip\.tripEndLocation/, 'Timeline must not display stale legacy trip location fields')
assert.doesNotMatch(timelineView, /refreshLocationNames|refreshUnresolvedLocationNames|Refresh area names|Pull down to resolve area name/)
assert.doesNotMatch(eventLocationService, /resolveLocationName|ConnectivityService|locality|enrichment|reconcilePersistedTripLocations/i)
assert.match(boundary, /enableHighAccuracy: true/)
console.log('PASS: Timeline displays saved event coordinates without locality network requests or legacy location fallback')
