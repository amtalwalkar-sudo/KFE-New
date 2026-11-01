import assert from 'node:assert/strict'
import fs from 'node:fs'
import { locationLabel } from '../application/timeline/activityTimelineReadService.js'

const eventLocationService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const eventLocalityService = fs.readFileSync('src/application/location/eventLocalityService.js', 'utf8')
const timelineView = fs.readFileSync('src/views/ActivityTimelineView.vue', 'utf8')
const readService = fs.readFileSync('src/application/timeline/activityTimelineReadService.js', 'utf8')
const localityRepository = fs.readFileSync('src/repositories/localityRepository.js', 'utf8')
const indexedDb = fs.readFileSync('src/utils/indexedDB.js', 'utf8')
const canonicalBoundary = fs.readFileSync('src/application/work/canonicalWorkBoundary.js', 'utf8')

assert.match(eventLocationService, /async forEntities\(entityType, entityIds = \[\], eventTypes = \[\.\.\.RIDE_EVENTS\]\)/)
assert.match(eventLocationService, /getEventLocationSnapshot/)
assert.match(eventLocationService, /RIDE_EVENTS/)
assert.match(readService, /EventLocationService\.forEntities\('TRIP', periodTrips\.map/)
assert.match(readService, /\['PICKUP_START', 'TRIP_END'\]/, 'Timeline reads only pickup and trip-end snapshots; locality resolution still covers all four events')
assert.match(readService, /LocalityRepository\.forSnapshotIds/)
assert.match(readService, /locationLabel\(locations\.pickup, localityBySnapshotId\)/)
assert.match(readService, /locationLabel\(locations\.end, localityBySnapshotId\)/)
const savedLabel = new Map([['gps-1', { placeName: 'Verified locality' }]])
const accurateSnapshot = { id: 'gps-1', latitude: 19.076, longitude: 72.8777, accuracy: 75 }
assert.equal(locationLabel(accurateSnapshot, savedLabel), 'Verified locality')
assert.equal(locationLabel({ ...accurateSnapshot, accuracy: null }, savedLabel), '19.07600, 72.87770',
  'A locality label without recorded GPS accuracy must not be displayed.')
assert.equal(locationLabel({ ...accurateSnapshot, accuracy: null }, savedLabel), '19.07600, 72.87770',
  'Offline fallback may show raw coordinates when accuracy is unavailable, never a locality label.')
assert.equal(locationLabel({ ...accurateSnapshot, accuracy: 75.01 }, savedLabel), 'Location unavailable',
  'A saved locality label must not override a poor-accuracy GPS fix.')

assert.doesNotMatch(readService, /isOnline|navigator\.onLine/, 'Opening or reading Timeline must not perform a connectivity check.')
assert.match(eventLocalityService, /LOCALITY_RESOLUTION_MAX_AGE_MS = 7 \* 24 \* 60 \* 60 \* 1000/)
assert.match(eventLocalityService, /TRIP_START.*TRIP_END.*TRIP_CANCELLED/)
assert.match(eventLocalityService, /LocalityRepository\.saveResolved/)
assert.match(eventLocalityService, /WorkRuntimePorts\.platform\.isOnline\(\)/)
assert.doesNotMatch(eventLocalityService, /navigator\.onLine/)
assert.match(localityRepository, /snapshotId/)
assert.match(localityRepository, /store\.add\(saved\)/)
assert.match(indexedDb, /createObjectStore\('locality_labels', \{ keyPath: 'snapshotId' \}\)/)
assert.match(timelineView, /EventLocalityService\.resolveSnapshots\(eligible\)/)
assert.match(timelineView, /@touchstart\.passive="onTouchStart"/)
assert.match(timelineView, /@touchend\.passive="onTouchEnd"/)
assert.match(timelineView, /Pull down to resolve unsaved GPS locality names from the last seven days when online/)
assert.match(canonicalBoundary, /while \(offset < expectedTotal\)/)
assert.match(canonicalBoundary, /limit: pageSize, offset/)
assert.match(canonicalBoundary, /pagination is incomplete/, 'Native GPS history must fail closed when any page is missing.')
assert.match(canonicalBoundary, /duplicate snapshot ID/)
assert.doesNotMatch(readService, /getCachedLocationName/)
assert.doesNotMatch(timelineView, /forceRefresh: true/)
console.log('PASS: all four event localities persist permanently in PWA IndexedDB; Timeline reads only selected-period snapshots')
