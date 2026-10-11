import { LocationRepository } from '../../repositories/locationRepository.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
import { MovementAccountingService, routeTrace } from '../../domain/movement/movementAccounting.js'
import { calculateTraceDistanceKm } from '../../infrastructure/location/movementTraceService.js'
import { ValhallaRoutingAdapter } from '../../infrastructure/location/valhallaRoutingAdapter.js'

const QUEUE_KEY = 'kfe.movement-reconciliation-queue.v1'
const LIVE_MATCH_INTERVAL_MS = 30000
const MIN_LIVE_MATCH_POINTS = 4
let lastLiveMatchAt = new Map()
let flushPromise = null
let lastFlushAt = 0
const FLUSH_INTERVAL_MS = 30000
const online = () => typeof navigator === 'undefined' || navigator.onLine !== false
const readQueue = () => {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
    return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && id))] : []
  } catch (_) { return [] }
}
const writeQueue = ids => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify([...new Set(ids)])); return true }
  catch (_) { return false }
}
const enqueue = id => { if (!id) return; writeQueue([...readQueue(), id]) }
const isRoadMatch = result => Boolean(
  result?.method === 'VALHALLA_TRACE_ROUTE_MAP_MATCH' &&
  result?.roadMatchedGeometry?.type === 'LineString' &&
  Array.isArray(result.roadMatchedGeometry.coordinates) &&
  result.roadMatchedGeometry.coordinates.length >= 2 &&
  Number.isFinite(Number(result.distanceKm)) && Number(result.distanceKm) >= 0
)

export const MovementReconciliationQueue = Object.freeze({
  async matchLiveTrace(entityType, entityId, tracePoints) {
    if (!online() || !entityId || !Array.isArray(tracePoints) || tracePoints.length < MIN_LIVE_MATCH_POINTS) return null
    const key = entityType + ':' + entityId
    const now = Date.now()
    if (now - (lastLiveMatchAt.get(key) || 0) < LIVE_MATCH_INTERVAL_MS) return null
    lastLiveMatchAt.set(key, now)
    try {
      const routed = await routeTrace(MovementAccountingService.filterGpsTrace(tracePoints), new ValhallaRoutingAdapter())
      return isRoadMatch(routed) ? {
        distanceKm: Number(routed.distanceKm),
        method: routed.method,
        provenance: routed.provenance,
        roadMatchedGeometry: routed.roadMatchedGeometry
      } : null
    } catch (_) { return null }
  },

  async enqueuePendingCompletedTrips() {
    let trips = []
    try { trips = await ShiftTripRepository.getAllTrips() } catch (_) { return readQueue() }
    const pending = trips.filter(trip =>
      trip?.id && trip.status === 'COMPLETED' &&
      trip.tripKmAuthority === 'GPS_LINE_TRACE' &&
      trip.tripKmProvenance?.method !== 'VALHALLA_TRACE_ROUTE_MAP_MATCH'
    ).map(trip => trip.id)
    writeQueue([...readQueue(), ...pending])
    return readQueue()
  },

  async reconcilePending({ force = false } = {}) {
    await this.enqueuePendingCompletedTrips()
    if (!online()) return { status: 'OFFLINE', queued: readQueue().length, reconciled: 0 }
    if (flushPromise) return flushPromise
    if (!force && Date.now() - lastFlushAt < FLUSH_INTERVAL_MS) return { status: 'THROTTLED', queued: readQueue().length, reconciled: 0 }
    lastFlushAt = Date.now()
    flushPromise = (async () => {
      const queue = readQueue()
      const remaining = []
      let reconciled = 0
      for (const tripId of queue) {
        try {
          const trips = await ShiftTripRepository.getAllTrips()
          const trip = trips.find(item => item?.id === tripId && item.status === 'COMPLETED')
          if (!trip) continue
          const snapshots = (await LocationRepository.forEntity('TRIP', tripId))
            .filter(point => point?.eventType === 'PASSENGER_RIDE_TRACE')
          if (snapshots.length < 2) { remaining.push(tripId); continue }
          const routed = await routeTrace(snapshots, new ValhallaRoutingAdapter())
          if (!isRoadMatch(routed)) { remaining.push(tripId); continue }
          const gpsKm = calculateTraceDistanceKm(MovementAccountingService.filterGpsTrace(snapshots))
          await ShiftTripRepository.enrichTripMovement({
            id: tripId,
            tripKm: Number(routed.distanceKm),
            tripKmAuthority: 'VALHALLA_ROAD_TRACE',
            tripKmProvenance: {
              ...(routed.provenance || {}),
              method: routed.method,
              confidence: routed.confidence,
              gpsTracePoints: routed.points?.length || snapshots.length,
              fallbackGpsKm: Number.isFinite(Number(gpsKm)) ? Number(gpsKm) : null,
              reconciledAfterReconnect: true
            },
            roadMatchedGeometry: routed.roadMatchedGeometry,
            traceGeometry: routed.traceGeometry || []
          })
          reconciled += 1
        } catch (_) { remaining.push(tripId) }
      }
      writeQueue(remaining)
      return { status: remaining.length ? 'PENDING' : 'COMPLETE', queued: remaining.length, reconciled }
    })().finally(() => { flushPromise = null })
    return flushPromise
  },

  getPendingIds() { return readQueue() }
})
