import { MovementTraceService, MOVEMENT_TRACE_INTERVALS_MS } from './movementTraceService.js'

export const DeadKmPickupGpsService = {
  intervalMs: MOVEMENT_TRACE_INTERVALS_MS.DEAD_LEG,
  start(onPoint, { entityType = 'SHIFT', entityId, eventType = 'DEAD_MOVEMENT_TRACE' } = {}) {
    return MovementTraceService.start({ entityType, entityId, eventType, profile: 'DEAD_LEG', onPoint })
  },
  async stop(options = {}) { return MovementTraceService.stop(options) },
  reset() { MovementTraceService.reset() },
  getPoints() { return MovementTraceService.getPoints() },
  getPointCount() { return MovementTraceService.getPointCount() },
  getTestSummary() {
    const points = this.getPoints()
    const timestamps = points.map(point => Date.parse(point.capturedAt)).filter(Number.isFinite)
    const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index]).filter(interval => interval > 0)
    const target = this.intervalMs
    const nearIntervalPoints = intervals.filter(interval => interval >= target * 0.5 && interval <= target * 1.5).length
    const maxGapMs = intervals.length ? Math.max(...intervals) : 0
    return { points: points.length, nearTwoSecondIntervals: nearIntervalPoints, nearTwentySecondIntervals: nearIntervalPoints, maxGapMs, passed: points.length >= 2 }
  }
}
export const PICKUP_GPS_INTERVAL_MS = MOVEMENT_TRACE_INTERVALS_MS.DEAD_LEG
export const PICKUP_GPS_MAX_POINT_GAP_MS = 60000
