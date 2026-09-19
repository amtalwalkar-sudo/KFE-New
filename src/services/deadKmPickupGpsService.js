import { MovementTraceService, MOVEMENT_TRACE_INTERVALS_MS } from './movementTraceService.js'

const normalizePoint = position => {
  const coords = position?.coords || position
  const latitude = Number(coords?.latitude)
  const longitude = Number(coords?.longitude)
  const accuracy = Number(coords?.accuracy)
  const timestamp = new Date(position?.timestamp || coords?.timestamp || Date.now()).toISOString()
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null, speed: Number.isFinite(Number(coords?.speed)) ? Number(coords.speed) : null, bearing: Number.isFinite(Number(coords?.heading)) ? Number(coords.heading) : null, capturedAt: timestamp }
}

export const isPickupGpsPoint = point => Boolean(point && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)) && (point.accuracy == null || Number(point.accuracy) <= 100))
export const acceptPickupGpsPoint = (points, point) => { const normalized = normalizePoint(point); if (!isPickupGpsPoint(normalized)) return points; const previous = points.at(-1); return previous?.capturedAt === normalized.capturedAt ? points : [...points, normalized] }
export const pickupGpsTestSummary = points => {
  const valid = (points || []).filter(isPickupGpsPoint)
  const timestamps = valid.map(point => Date.parse(point.capturedAt)).filter(Number.isFinite)
  const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index]).filter(interval => interval > 0)
  const target = MOVEMENT_TRACE_INTERVALS_MS.DEAD_LEG
  const nearTwentySecondIntervals = intervals.filter(interval => interval >= target * 0.5 && interval <= target * 1.5).length
  const maxGapMs = intervals.length ? Math.max(...intervals) : 0
  return { points: valid.length, nearTwoSecondIntervals: nearTwentySecondIntervals, nearTwentySecondIntervals, maxGapMs, passed: valid.length >= 2 }
}

export const DeadKmPickupGpsService = {
  intervalMs: MOVEMENT_TRACE_INTERVALS_MS.DEAD_LEG,
  start(onPoint, { entityType = 'SHIFT', entityId, eventType = 'DEAD_MOVEMENT_TRACE' } = {}) {
    return MovementTraceService.start({ entityType, entityId, eventType, profile: 'DEAD_LEG', onPoint })
  },
  async stop(options = {}) { return MovementTraceService.stop(options) },
  reset() { MovementTraceService.reset() },
  getPoints() { return MovementTraceService.getPoints() },
  getPointCount() { return MovementTraceService.getPointCount() },
  getTestSummary() { return pickupGpsTestSummary(this.getPoints()) }
}
export const PICKUP_GPS_INTERVAL_MS = MOVEMENT_TRACE_INTERVALS_MS.DEAD_LEG
export const PICKUP_GPS_MAX_POINT_GAP_MS = 60000
