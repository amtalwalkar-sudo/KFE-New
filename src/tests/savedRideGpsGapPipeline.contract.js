import assert from 'node:assert/strict'
import { WorkService } from '../application/work/workService.js'
import { configureWorkRuntimePorts } from '../application/work/workRuntimePorts.js'
import { ShiftTripRepository } from '../repositories/shiftTripRepository.js'
import { LocationRepository } from '../repositories/locationRepository.js'
import { setActiveDataSource } from '../utils/indexedDB.js'

const originals = {
  completeTrip: ShiftTripRepository.completeTrip,
  getActive: ShiftTripRepository.getActive,
  getTripsForShift: ShiftTripRepository.getTripsForShift,
  enrichTripMovement: ShiftTripRepository.enrichTripMovement,
  forEntity: LocationRepository.forEntity
}

let storedTrip
let storedTripJson = null
let storedShiftId
let snapshots
let routeGapMode = 'unresolved'
let resolveEnrichment
let enrichmentPromise

const noop = async () => true
configureWorkRuntimePorts({
  movementTrace: {
    start: noop, reset: noop, getActiveSession: () => null, getPoints: () => [],
    stop: async () => [], resumePersisted: noop, pause: noop, getDistanceKm: () => 0
  },
  nativeGps: {
    start: noop, stop: noop, readTrace: async () => [],
    syncTrace: async () => ({ imported: snapshots.length }),
    getPermissionStatus: async () => ({ granted: true }),
    openAppSettings: noop, listTraceOwners: async () => []
  },
  nativeWorkActions: {
    clearPendingAction: noop, addListener: async () => ({ remove: noop }),
    consumePendingActions: async () => [], consumePendingAction: async () => null,
    acknowledgeAction: noop, recordActionFailure: noop
  },
  canonicalWork: {
    putRecord: async () => ({ accepted: true }), getRecord: async () => ({ found: false }),
    listRecords: async () => ({ records: [] }), getOperation: async () => ({ found: false }),
    isAvailable: () => false
  },
  androidOverlay: { hide: noop, update: noop, prepare: noop, fareSaved: noop, cancelSaved: noop },
  routing: {
    createRouter: () => ({
      routeTrace: async points => {
        const elapsed = Date.parse(points[points.length - 1]?.capturedAt || '') -
          Date.parse(points[0]?.capturedAt || '')
        const isGap = elapsed > 120000
        const geometry = {
          type: 'LineString',
          coordinates: points.map(point => [Number(point.longitude), Number(point.latitude)])
        }
        if (isGap && routeGapMode === 'unresolved') {
          // Deliberately return a straight-line fallback: the saved-ride pipeline
          // must reject it as road distance and keep this interval unresolved.
          return {
            distanceKm: 99, method: 'HAVERSINE_ENDPOINT_FALLBACK',
            confidence: 'ESTIMATED_STRAIGHT_LINE', geometry,
            provenance: { provider: 'KFE_ENDPOINT_FALLBACK' }
          }
        }
        return {
          distanceKm: isGap ? 4.75 : 1.25,
          method: 'VALHALLA_TRACE',
          confidence: isGap ? 'ESTIMATED_ROAD_TRACE' : 'HIGH',
          geometry,
          provenance: { provider: 'valhalla', fixture: true }
        }
      }
    })
  },
  platform: { getPlatform: () => 'web' }
})

const t0 = Date.parse('2026-10-16T10:00:00.000Z')
const point = (minute, longitude) => ({
  entityType: 'TRIP',
  entityId: '',
  eventType: 'PASSENGER_RIDE_TRACE',
  latitude: 19.01,
  longitude,
  accuracy: 8,
  speed: 8,
  capturedAt: new Date(t0 + minute * 60000).toISOString()
})

const runCompletion = async (tripId, gapMode) => {
  routeGapMode = gapMode
  storedShiftId = `shift-${tripId}`
  storedTrip = {
    id: tripId,
    shiftId: storedShiftId,
    status: 'ACTIVE',
    tripStartAt: new Date(t0).toISOString(),
    tripEndAt: new Date(t0 + 12 * 60000).toISOString(),
    updatedAt: new Date(t0 + 12 * 60000).toISOString()
  }
  snapshots = [
    point(0, 72.8500),
    point(1, 72.8600),
    point(11, 72.9500),
    point(12, 72.9600)
  ].map(item => ({ ...item, entityId: tripId }))
  storedTripJson = JSON.stringify(storedTrip) // persistence boundary: only serialized canonical data survives reload
  enrichmentPromise = new Promise(resolve => { resolveEnrichment = resolve })

  const result = await WorkService.completeTrip({ id: tripId, tripEndAt: storedTrip.tripEndAt })
  assert.ok(result, 'The authoritative completion must return without waiting for routing enrichment.')

  let timeoutId
  try {
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`GPS enrichment timed out for ${tripId}`)), 5000)
    })
    await Promise.race([enrichmentPromise, timeout])
  } finally {
    clearTimeout(timeoutId)
  }

  // Reload through the same repository read boundary after the enrichment write.
  const reloaded = (await ShiftTripRepository.getTripsForShift(storedShiftId)).find(item => item.id === tripId)
  assert.ok(reloaded, 'Completed ride must still be readable after enrichment.')
  assert.equal(reloaded.tripKmAuthority, 'GPS_TRACE_INCOMPLETE')
  assert.equal(JSON.parse(JSON.stringify(reloaded)).tripKmAuthority, 'GPS_TRACE_INCOMPLETE',
    'Incomplete-kilometre authority must survive canonical JSON serialization and reload.')
  assert.equal(reloaded.tripKmProvenance.gpsRecordingStatus, 'INCOMPLETE')
  assert.equal(reloaded.tripKmProvenance.recordingGapDetected, true)
  assert.equal(reloaded.tripKmProvenance.knownTraceSegments.length, 2)
  assert.equal(reloaded.roadMatchedGeometry, null, 'A single geometry must not bridge the GPS outage.')
  assert.deepEqual(reloaded.traceGeometry, [], 'A continuous line must not be fabricated across the outage.')
  return reloaded
}

try {
  ShiftTripRepository.completeTrip = async ({ id, tripEndAt }) => {
    storedTrip = { ...storedTrip, id, status: 'COMPLETED', tripEndAt }
    storedTripJson = JSON.stringify(storedTrip)
    return JSON.parse(storedTripJson)
  }
  ShiftTripRepository.getActive = async () => ({ shift: { id: storedShiftId } })
  ShiftTripRepository.getTripsForShift = async shiftId => shiftId === storedShiftId
    ? [JSON.parse(storedTripJson || JSON.stringify(storedTrip))]
    : []
  ShiftTripRepository.enrichTripMovement = async payload => {
    storedTrip = { ...storedTrip, ...payload }
    storedTripJson = JSON.stringify(storedTrip)
    resolveEnrichment(JSON.parse(storedTripJson))
    return true
  }
  LocationRepository.forEntity = async (entityType, entityId) =>
    entityType === 'TRIP' ? snapshots.filter(point => point.entityId === entityId) : []

  const unresolved = await runCompletion('saved-ride-gap-unresolved', 'unresolved')
  assert.ok(unresolved.tripKm > 2 && unresolved.tripKm < 3,
    'Only the two continuous GPS sections contribute measured KM; the 99 km straight-line fallback must be rejected.')
  assert.ok(Math.abs(unresolved.tripKm - unresolved.tripKmProvenance.knownDistanceKm) < 1e-9)
  assert.equal(unresolved.tripKmProvenance.estimatedGapDistanceKm, 0)
  assert.equal(unresolved.tripKmProvenance.unresolvedGapCount, 1)
  assert.equal(unresolved.tripKmProvenance.incompleteKmSegments[0].status, 'UNRESOLVED')
  assert.equal(unresolved.tripKmProvenance.incompleteKmSegments[0].distanceKm, null)

  const estimated = await runCompletion('saved-ride-gap-estimated', 'estimate')
  assert.ok(Math.abs(estimated.tripKm - 7.25) < 1e-9,
    'A valid Valhalla gap route may be included only as a separately labelled estimate.')
  assert.equal(estimated.tripKmProvenance.knownDistanceKm, 2.5)
  assert.equal(estimated.tripKmProvenance.estimatedGapDistanceKm, 4.75)
  assert.equal(estimated.tripKmProvenance.unresolvedGapCount, 0)
  assert.equal(estimated.tripKmProvenance.incompleteKmSegments[0].status, 'ESTIMATED')
  assert.equal(estimated.tripKmProvenance.incompleteKmSegments[0].method, 'VALHALLA_TRACE')
  assert.equal(estimated.tripKmProvenance.incompleteKmSegments[0].routingProvenance.provider, 'valhalla')

  console.log('PASS: saved-ride completion persists/reloads incomplete GPS provenance, rejects straight-line outage distance, and labels valid Valhalla gap distance as estimated.')
} finally {
  ShiftTripRepository.completeTrip = originals.completeTrip
  ShiftTripRepository.getActive = originals.getActive
  ShiftTripRepository.getTripsForShift = originals.getTripsForShift
  ShiftTripRepository.enrichTripMovement = originals.enrichTripMovement
  LocationRepository.forEntity = originals.forEntity
}


// Exercise the real IndexedDB-backed repository after the mocked unit scenarios above.
// This is intentionally a separate phase: it commits through WorkService's real
// business calculation, closes the active database connection, reopens it, and
// asserts the durable domain-level GPS gap flag rather than a JSON fixture.
const runActualIndexedDbPersistenceBoundary = async () => {
  const suffix = `gps-gap-indexeddb-${Date.now()}`
  const shiftId = `shift-${suffix}`
  const tripId = `trip-${suffix}`
  const tripStartAt = new Date(t0).toISOString()
  const tripEndAt = new Date(t0 + 12 * 60000).toISOString()
  storedShiftId = shiftId
  routeGapMode = 'unresolved'
  snapshots = [
    point(0, 72.8500),
    point(1, 72.8600),
    point(11, 72.9500),
    point(12, 72.9600)
  ].map(item => ({ ...item, entityId: tripId }))

  await ShiftTripRepository.createShift({ id: shiftId, startOdometer: 0, shiftStartAt: tripStartAt })
  await ShiftTripRepository.createTrip({ id: tripId, shiftId, tripStartAt, tripStage: 'RIDE_STARTED' })
  for (const gpsPoint of snapshots) {
    await LocationRepository.recordTracePoint({
      entityType: 'TRIP', entityId: tripId, eventType: 'PASSENGER_RIDE_TRACE',
      latitude: gpsPoint.latitude, longitude: gpsPoint.longitude,
      accuracy: gpsPoint.accuracy, speed: gpsPoint.speed, capturedAt: gpsPoint.capturedAt
    })
  }

  await WorkService.completeTrip({ id: tripId, tripEndAt })
  let enriched = null
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const records = await ShiftTripRepository.getTripsForShift(shiftId)
    enriched = records.find(item => item.id === tripId) || null
    if (enriched?.tripKmAuthority === 'GPS_TRACE_INCOMPLETE'
        && enriched?.tripKmProvenance?.recordingGapDetected === true) break
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.ok(enriched, 'The completed trip must be persisted in the real IndexedDB trips store.')
  assert.equal(enriched.status, 'COMPLETED')
  assert.equal(enriched.tripKmAuthority, 'GPS_TRACE_INCOMPLETE',
    'The actual business calculation must mark the trip kilometres incomplete when the GPS trace has an outage.')
  assert.equal(enriched.tripKmProvenance.gpsRecordingStatus, 'INCOMPLETE')
  assert.equal(enriched.tripKmProvenance.recordingGapDetected, true)
  assert.equal(enriched.tripKmProvenance.knownTraceSegments.length, 2)
  assert.equal(enriched.tripKmProvenance.unresolvedGapCount, 1)
  assert.equal(enriched.tripKmProvenance.estimatedGapDistanceKm, 0)
  assert.equal(enriched.roadMatchedGeometry, null)
  assert.deepEqual(enriched.traceGeometry, [])

  // Close every cached IndexedDB connection and reopen the canonical database,
  // which makes this a real storage lifecycle boundary rather than JSON cloning.
  setActiveDataSource('canonical')
  const afterReopen = (await ShiftTripRepository.getTripsForShift(shiftId)).find(item => item.id === tripId)
  assert.ok(afterReopen, 'The trip must be present after reopening canonical IndexedDB.')
  assert.equal(afterReopen.tripKmAuthority, 'GPS_TRACE_INCOMPLETE')
  assert.equal(afterReopen.tripKmProvenance.gpsRecordingStatus, 'INCOMPLETE')
  assert.equal(afterReopen.tripKmProvenance.recordingGapDetected, true)
  assert.equal(afterReopen.tripKmProvenance.knownTraceSegments.length, 2)
  assert.equal(afterReopen.tripKmProvenance.unresolvedGapCount, 1)
  assert.equal(afterReopen.tripKmProvenance.estimatedGapDistanceKm, 0)
  assert.equal(afterReopen.roadMatchedGeometry, null)
  assert.deepEqual(afterReopen.traceGeometry, [])
  console.log('PASS: actual IndexedDB business calculation and close/reopen preserve GPS gap flags and unresolved-distance accounting.')
}

await runActualIndexedDbPersistenceBoundary()
