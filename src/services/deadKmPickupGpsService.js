const DEFAULT_INTERVAL_MS = 2000
const MIN_ACCEPTABLE_ACCURACY_M = 100
const MAX_POINT_GAP_MS = 15000

const normalizePoint = position => {
  const coords = position?.coords || position
  const latitude = Number(coords?.latitude)
  const longitude = Number(coords?.longitude)
  const accuracy = Number(coords?.accuracy)
  const timestamp = new Date(position?.timestamp || coords?.timestamp || Date.now()).toISOString()
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    speed: Number.isFinite(Number(coords?.speed)) ? Number(coords.speed) : null,
    bearing: Number.isFinite(Number(coords?.heading)) ? Number(coords.heading) : null,
    capturedAt: timestamp
  }
}

export const isPickupGpsPoint = point => {
  if (!point) return false
  if (!Number.isFinite(Number(point.latitude)) || !Number.isFinite(Number(point.longitude))) return false
  if (point.accuracy != null && Number(point.accuracy) > MIN_ACCEPTABLE_ACCURACY_M) return false
  return true
}

export const acceptPickupGpsPoint = (points, point) => {
  const normalized = normalizePoint(point)
  if (!isPickupGpsPoint(normalized)) return points
  const previous = points.at(-1)
  if (previous && previous.capturedAt === normalized.capturedAt) return points
  return [...points, normalized]
}

export const pickupGpsTestSummary = points => {
  const valid = (points || []).filter(isPickupGpsPoint)
  const timestamps = valid.map(point => Date.parse(point.capturedAt)).filter(Number.isFinite)
  const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index]).filter(interval => interval > 0)
  const nearTwoSecondPoints = intervals.filter(interval => interval >= 1500 && interval <= 3500).length
  const maxGapMs = intervals.length ? Math.max(...intervals) : 0
  return {
    points: valid.length,
    nearTwoSecondIntervals: nearTwoSecondPoints,
    maxGapMs,
    passed: valid.length >= 2 && maxGapMs <= MAX_POINT_GAP_MS
  }
}

let watchId = null
let points = []
let lastAcceptedAt = 0
let handler = null

export const DeadKmPickupGpsService = {
  intervalMs: DEFAULT_INTERVAL_MS,
  getPoints() { return [...points] },
  getPointCount() { return points.length },
  getTestSummary() { return pickupGpsTestSummary(points) },
  reset() {
    if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation?.clearWatch) navigator.geolocation.clearWatch(watchId)
    watchId = null
    points = []
    lastAcceptedAt = 0
    handler = null
  },
  start(onPoint) {
    this.reset()
    handler = typeof onPoint === 'function' ? onPoint : null
    if (typeof navigator === 'undefined' || !navigator.geolocation?.watchPosition) return false
    watchId = navigator.geolocation.watchPosition(position => {
      const point = normalizePoint(position)
      const now = Date.now()
      if (!point || now - lastAcceptedAt < DEFAULT_INTERVAL_MS) return
      const next = acceptPickupGpsPoint(points, point)
      if (next.length === points.length) return
      points = next
      lastAcceptedAt = now
      handler?.(point, points.length)
    }, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    })
    return true
  },
  stop() {
    if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation?.clearWatch) navigator.geolocation.clearWatch(watchId)
    watchId = null
    handler = null
  }
}

export const PICKUP_GPS_INTERVAL_MS = DEFAULT_INTERVAL_MS
export const PICKUP_GPS_MAX_POINT_GAP_MS = MAX_POINT_GAP_MS
