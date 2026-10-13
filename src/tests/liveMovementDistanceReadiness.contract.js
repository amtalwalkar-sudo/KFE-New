import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { getLiveMovementTracePlan, matchesLiveMovementSession } from '../application/work/liveMovementTrace.js'
import { isRoadMatch } from '../application/work/movementReconciliationQueue.js'

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

const workView = fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8')
assert.match(workView, /ensureDeadMovementCapture\('SHIFT', store\.shift\.id\)/, 'Starting a shift must start local movement capture immediately.')
assert.match(workView, /getLiveMovementTracePlan\(\{ shiftId: store\.shift\.id, trip: currentTrip \}\)/, 'Live display chooses GPS event type from the actual trip phase.')
assert.match(workView, /ensureDeadMovementCapture\('TRIP', store\.trip\.id\)/, 'Pickup capture is re-owned by the trip so live dead KM starts from pickup.')
console.log('Live GPS distance readiness contract: PASS — shift-start capture, pickup/ride trace selection, and offline road-match acceptance.')
