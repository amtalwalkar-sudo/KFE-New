import { LocationRepository } from '../../repositories/locationRepository.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
import { MovementAccountingService, routeTrace } from '../../domain/movement/movementAccounting.js'
import { calculateTraceDistanceKm } from '../../infrastructure/location/movementTraceService.js'
import { ValhallaRoutingAdapter } from '../../infrastructure/location/valhallaRoutingAdapter.js'

const QUEUE_KEY = 'kfe.movement-reconciliation-queue.v1'
const LIVE_MATCH_INTERVAL_MS = 30000
const MIN_LIVE_MATCH_POINTS = 4
let lastLiveMatchAt = new Map()
let lastLiveMatches = new Map()
let flushPromise = null
let lastFlushAt = 0
let lastDiscoveryAt = 0
const FLUSH_INTERVAL_MS = 30000
const DISCOVERY_INTERVAL_MS = 30000
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
export const isRoadMatch = result => Boolean(
  ['VALHALLA_TRACE_ROUTE_MAP_MATCH', 'OFFLINE_VALHALLA_TRACE_ROUTE_MAP_MATCH'].includes(result?.method) &&
  result?.roadMatchedGeometry?.type === 'LineString' &&
  Array.isArray(result.roadMatchedGeometry.coordinates) &&
  result.roadMatchedGeometry.coordinates.length >= 2 &&
  Number.isFinite(Number(result.distanceKm)) && Number(result.distanceKm) >= 0
)

export const extendRoadMatchWithLiveGpsTail = (cached, tracePoints = []) => {
  if (!cached || !Array.isArray(tracePoints)) return null
  const previousCount = Math.max(0, Number(cached.sourcePointCount) || 0)
  if (tracePoints.length <= previousCount) return cached
  const tail = tracePoints.slice(Math.max(0, previousCount - 1))
  const tailKm = tail.length > 1 ? calculateTraceDistanceKm(tail) : 0
  return {
    ...cached,
    distanceKm: Number(cached.distanceKm) + tailKm,
    sourcePointCount: tracePoints.length,
    liveGpsTailKm: (Number(cached.liveGpsTailKm) || 0) + tailKm
  }
}

export const MovementReconciliationQueue = Object.freeze({
  async matchLiveTrace(entityType, entityId, tracePoints) {
    if (!entityId || !Array.isArray(tracePoints) || tracePoints.length < MIN_LIVE_MATCH_POINTS) return null
    const key = entityType + ':' + entityId
    const now = Date.now()
    // Never replay an older full-trace road distance over the newer live GPS estimate.
    // The next eligible call re-matches the complete current trace.
    if (now - (lastLiveMatchAt.get(key) || 0) < LIVE_MATCH_INTERVAL_MS) {
      const extended = extendRoadMatchWithLiveGpsTail(lastLiveMatches.get(key), tracePoints)
      if (extended) lastLiveMatches.set(key, extended)
      return extended
    }
    lastLiveMatchAt.set(key, now)
    try {
      const routed = await routeTrace(MovementAccountingService.filterGpsTrace(tracePoints), new ValhallaRoutingAdapter({ onlineFallback: online() }))
      if (!isRoadMatch(routed)) { lastLiveMatches.delete(key); return null }
      const matched = {
        distanceKm: Number(routed.distanceKm),
        method: routed.method,
        provenance: routed.provenance,
        roadMatchedGeometry: routed.roadMatchedGeometry,
        sourcePointCount: tracePoints.length,
        liveGpsTailKm: 0
      }
      lastLiveMatches.set(key, matched)
      return matched
    } catch (_) { lastLiveMatches.delete(key); return null }
  },

  async enqueuePendingCompletedTrips({ force = false } = {}) {
    if (!force && Date.now() - lastDiscoveryAt < DISCOVERY_INTERVAL_MS) return readQueue()
    lastDiscoveryAt = Date.now()
    let trips = []
    try { trips = await ShiftTripRepository.getAllTrips() } catch (_) { return readQueue() }
    const candidates = trips.filter(trip =>
      trip?.id && trip.status === 'COMPLETED' &&
      (trip.tripKmAuthority === 'GPS_LINE_TRACE' || (!trip.tripKmAuthority && (trip.tripKm == null || trip.tripKm === ''))) &&
      trip.tripKmProvenance?.method !== 'VALHALLA_TRACE_ROUTE_MAP_MATCH'
    )
    const pending = []
    for (const trip of candidates) {
      try {
        const snapshots = (await LocationRepository.forEntity('TRIP', trip.id))
          .filter(point => point?.eventType === 'PASSENGER_RIDE_TRACE')
        if (snapshots.length >= 2) pending.push(trip.id)
      } catch (_) { pending.push(trip.id) }
    }
    writeQueue([...readQueue(), ...pending])
    return readQueue()
  },

  async reconcilePending({ force = false } = {}) {
    await this.enqueuePendingCompletedTrips({ force })
    // Try local Valhalla even without connectivity; the adapter disables HTTP fallback
    // while offline, so pending records remain local and retry after reconnect.
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
          const routed = await routeTrace(snapshots, new ValhallaRoutingAdapter({ onlineFallback: online() }))
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

// The trace itself is persisted locally; queue reconciliation on startup and when
// connectivity returns. Neither listener is required for GPS capture to continue.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { lastLiveMatchAt = new Map(); void MovementReconciliationQueue.reconcilePending({ force: true }) })
  void MovementReconciliationQueue.reconcilePending()
}
