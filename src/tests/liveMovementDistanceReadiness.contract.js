import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { getLiveMovementTracePlan, matchesLiveMovementSession } from '../application/work/liveMovementTrace.js'
import { isRoadMatch, extendRoadMatchWithLiveGpsTail } from '../application/work/movementReconciliationQueue.js'
import { ValhallaRoutingAdapter } from '../infrastructure/location/valhallaRoutingAdapter.js'
import { normalizeNullableGpsNumber } from '../repositories/locationRepository.js'
import { MovementAccountingService } from '../domain/movement/movementAccounting.js'

assert.equal(normalizeNullableGpsNumber(null), null, 'Missing GPS accuracy must remain unknown, not become a perfect 0 m fix.')
assert.equal(normalizeNullableGpsNumber(''), null)
assert.equal(normalizeNullableGpsNumber(0), 0)
assert.equal(normalizeNullableGpsNumber('invalid'), null)
const unknownSpeedTrace = MovementAccountingService.filterGpsTrace([
  { latitude: 19.00000, longitude: 72.00000, accuracy: 5, speed: null, capturedAt: '2026-10-01T08:00:00.000Z' },
  { latitude: 19.00018, longitude: 72.00000, accuracy: 5, speed: null, capturedAt: '2026-10-01T08:00:10.000Z' }
])
assert.equal(unknownSpeedTrace.length, 2, 'Missing speed must not be interpreted as zero speed and discard genuine movement.')

// Cross-layer regression: Work state, capture ownership, local persistence, and route matching must agree.
const shift = getLiveMovementTracePlan({ shiftId: 'shift-1', trip: null })
assert.deepEqual(shift, { entityType: 'SHIFT', entityId: 'shift-1', eventType: 'DEAD_MOVEMENT_TRACE', profile: 'DEAD_LEG' })

const pickup = getLiveMovementTracePlan({
  shiftId: 'shift-1',
  trip: { id: 'trip-1', status: 'ACTIVE', tripStage: 'GOING_TO_PICKUP' }
})
assert.deepEqual(pickup, { entityType: 'TRIP', entityId: 'trip-1', eventType: 'DEAD_MOVEMENT_TRACE', profile: 'DEAD_LEG' })
assert.equal(matchesLiveMovementSession({
  entityType: 'TRIP', entityId: 'trip-1', eventType: 'DEAD_MOVEMENT_TRACE', profile: 'DEAD_LEG'
}, pickup), true, 'Pickup movement must consume dead-movement points owned by the active trip.')

const ride = getLiveMovementTracePlan({
  shiftId: 'shift-1',
  trip: { id: 'trip-1', status: 'ACTIVE', tripStage: 'RIDE_STARTED' }
})
assert.deepEqual(ride, { entityType: 'TRIP', entityId: 'trip-1', eventType: 'PASSENGER_RIDE_TRACE', profile: 'PASSENGER_RIDE' })
assert.equal(matchesLiveMovementSession({
  entityType: 'TRIP', entityId: 'trip-1', eventType: 'PASSENGER_RIDE_TRACE', profile: 'PASSENGER_RIDE'
}, ride), true)
assert.equal(matchesLiveMovementSession({
  entityType: 'TRIP', entityId: 'trip-1', eventType: 'DEAD_MOVEMENT_TRACE', profile: 'DEAD_LEG'
}, ride), false, 'Pickup GPS must not be mistaken for passenger-ride distance.')

const geometry = { type: 'LineString', coordinates: [[72.8, 19.0], [72.9, 19.1]] }
assert.equal(isRoadMatch({ method: 'VALHALLA_TRACE_ROUTE_MAP_MATCH', distanceKm: 3.2, roadMatchedGeometry: geometry }), true)
assert.equal(isRoadMatch({ method: 'OFFLINE_VALHALLA_TRACE_ROUTE_MAP_MATCH', distanceKm: 3.2, roadMatchedGeometry: geometry }), true, 'Valid offline Valhalla matches must be accepted by live/reconciliation queues.')
assert.equal(isRoadMatch({ method: 'OFFLINE_VALHALLA_TRACE_ROUTE_MAP_MATCH', distanceKm: 3.2, roadMatchedGeometry: null }), false, 'A distance without matched road geometry must not be accepted as a road match.')

const cachedRoadMatch = {
  method: 'VALHALLA_TRACE_ROUTE_MAP_MATCH',
  distanceKm: 1,
  sourcePointCount: 2,
  liveGpsTailKm: 0,
  roadMatchedGeometry: geometry
}
const extendedMatch = extendRoadMatchWithLiveGpsTail(cachedRoadMatch, [
  { latitude: 19.000, longitude: 72.000, capturedAt: '2026-10-01T08:00:00.000Z' },
  { latitude: 19.001, longitude: 72.000, capturedAt: '2026-10-01T08:00:10.000Z' },
  { latitude: 19.002, longitude: 72.000, capturedAt: '2026-10-01T08:00:20.000Z' }
])
assert.ok(extendedMatch.distanceKm > cachedRoadMatch.distanceKm, 'Live distance must continue advancing between throttled road-match requests.')
assert.equal(extendedMatch.sourcePointCount, 3)
assert.equal(extendRoadMatchWithLiveGpsTail(extendedMatch, [
  { latitude: 19.000, longitude: 72.000 },
  { latitude: 19.001, longitude: 72.000 },
  { latitude: 19.002, longitude: 72.000 }
]).distanceKm, extendedMatch.distanceKm, 'Repeated refreshes must not count the same GPS tail twice.')

let onlineRequests = 0
const offlineOnlyRouter = new ValhallaRoutingAdapter({
  endpoint: 'https://offline-must-not-fetch.example.test',
  onlineFallback: false,
  fetchImpl: async () => { onlineRequests += 1; throw new Error('HTTP fallback must be disabled while offline.') }
})
const outsideCoverage = await offlineOnlyRouter.routeTrace([
  { latitude: 25.0, longitude: 80.0, capturedAt: '2026-10-01T08:00:00.000Z' },
  { latitude: 25.001, longitude: 80.001, capturedAt: '2026-10-01T08:00:10.000Z' }
])
assert.equal(outsideCoverage, null)
assert.equal(onlineRequests, 0, 'Offline-only routing must never attempt HTTP fallback outside local tile coverage.')

const queueSource = fs.readFileSync(path.join(process.cwd(), 'src/application/work/movementReconciliationQueue.js'), 'utf8')
assert.match(queueSource, /new ValhallaRoutingAdapter\(\{ onlineFallback: online\(\) \}\)/, 'Live and queued matching select online fallback from connectivity.')
assert.doesNotMatch(queueSource, /if \(!online\(\) \|\| !entityId/, 'Live matching must still attempt offline Valhalla when disconnected.')

const workView = fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8')
assert.match(workView, /ensureDeadMovementCapture\('SHIFT', store\.shift\?\.id\)/, 'Starting a shift must start local movement capture immediately.')
assert.match(workView, /getLiveMovementTracePlan\(\{ shiftId: store\.shift\.id, trip: currentTrip \}\)/, 'Live display chooses GPS event type from the actual trip phase.')
assert.match(workView, /ensureDeadMovementCapture\('TRIP', store\.trip\?\.id\)/, 'Pickup capture is re-owned by the trip so live dead KM starts from pickup.')
assert.match(workView, /matchLiveTrace\([\s\S]*?tracePlan\.entityType[\s\S]*?tracePlan\.entityId/, 'Live map matching runs regardless of internet connectivity.')
const workService = fs.readFileSync(path.join(process.cwd(), 'src/application/work/workService.js'), 'utf8')
assert.match(workService, /Cancellation ends the trip trace/, 'Cancellation cleanup must restart shift capture after the trip trace is stopped.')
assert.match(workService, /nativeGps\.start\(active\.shift\.id, 'DEAD_MOVEMENT_TRACE', 'SHIFT'\)/, 'Cancellation cleanup must restore the canonical shift GPS owner.')
assert.match(workService, /Final shift GPS trace recovery incomplete/, 'Shift close must report when native evidence recovery fails.')
assert.match(workService, /const owners = await WorkRuntimePorts\.nativeGps\.listTraceOwners\(\)/, 'Shift reconciliation inventories native trace files before reading canonical snapshots.')
assert.match(workService, /GPS_TRACE_RECOVERY_FAILED/, 'Incomplete trace recovery must prevent a falsely successful reconciliation.')
const locationRepository = fs.readFileSync(path.join(process.cwd(), 'src/repositories/locationRepository.js'), 'utf8')
assert.match(locationRepository, /export const normalizeNullableGpsNumber/, 'GPS quality fields preserve missing values as unknown.')
const movementAccounting = fs.readFileSync(path.join(process.cwd(), 'src/domain/movement/movementAccounting.js'), 'utf8')
assert.match(movementAccounting, /point\.speed == null \|\| point\.speed === '' \? NaN : Number\(point\.speed\)/, 'Unknown speed is not treated as zero speed during stationary filtering.')
console.log('Live GPS distance readiness contract: PASS — shift/pickup/ride capture, offline routing, live tail extension, GPS quality preservation, cancellation recovery, and final-shift trace recovery.')
