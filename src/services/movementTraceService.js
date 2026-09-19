import { LocationRepository } from '../repositories/locationRepository.js'

export const MOVEMENT_TRACE_INTERVALS_MS = Object.freeze({
  DEAD_LEG: 20 * 1000,
  PASSENGER_RIDE: 20 * 1000
})

const PROFILES = Object.freeze({
  DEAD_LEG: Object.freeze({ intervalMs: MOVEMENT_TRACE_INTERVALS_MS.DEAD_LEG, enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }),
  PASSENGER_RIDE: Object.freeze({ intervalMs: MOVEMENT_TRACE_INTERVALS_MS.PASSENGER_RIDE, enableHighAccuracy: false, maximumAge: 10000, timeout: 10000 })
})

const normalizePoint = position => {
  const coords = position?.coords || position
  const latitude = Number(coords?.latitude)
  const longitude = Number(coords?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(Number(coords?.accuracy)) ? Number(coords.accuracy) : null,
    speed: Number.isFinite(Number(coords?.speed)) ? Number(coords.speed) : null,
    bearing: Number.isFinite(Number(coords?.heading)) ? Number(coords.heading) : null,
    capturedAt: new Date(position?.timestamp || coords?.timestamp || Date.now()).toISOString()
  }
}

let watchId = null
let points = []
let lastAcceptedAt = 0
let active = null

const persist = async point => {
  if (!active || !point) return
  try {
    await LocationRepository.recordTracePoint({
      entityType: active.entityType,
      entityId: active.entityId,
      eventType: active.eventType,
      ...point
    })
  } catch (_) {}
}

const accept = point => {
  if (!active || !point) return false
  const now = Date.now()
  if (now - lastAcceptedAt < active.profile.intervalMs) return false
  if (point.accuracy != null && point.accuracy > 100) return false
  const previous = points.at(-1)
  if (previous?.capturedAt === point.capturedAt) return false
  points = [...points, point]
  lastAcceptedAt = now
  void persist(point)
  active.onPoint?.(point, points.length)
  return true
}

const clearWatch = () => {
  if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation?.clearWatch) navigator.geolocation.clearWatch(watchId)
  watchId = null
}

const captureBoundary = () => new Promise(resolve => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
  const options = active?.profile || PROFILES.DEAD_LEG
  navigator.geolocation.getCurrentPosition(position => {
    const point = normalizePoint(position)
    if (point) {
      points = [...points, point]
      lastAcceptedAt = Date.now()
      void persist(point)
      active?.onPoint?.(point, points.length)
    }
    resolve(point)
  }, () => resolve(null), { ...options, maximumAge: 0 })
})

export const MovementTraceService = {
  profiles: PROFILES,
  start({ entityType, entityId, eventType = 'MOVEMENT_TRACE', profile = 'DEAD_LEG', onPoint } = {}) {
    this.reset()
    if (!entityType || !entityId || typeof navigator === 'undefined' || !navigator.geolocation?.watchPosition) return false
    active = { entityType, entityId, eventType, profile: PROFILES[profile] || PROFILES.DEAD_LEG, onPoint }
    watchId = navigator.geolocation.watchPosition(position => accept(normalizePoint(position)), () => {}, { ...active.profile })
    void captureBoundary()
    return true
  },
  async stop({ captureFinal = true } = {}) {
    if (!active) return [...points]
    if (captureFinal) await captureBoundary()
    clearWatch()
    const result = [...points]
    active = null
    return result
  },
  getPoints() { return [...points] },
  getPointCount() { return points.length },
  getProfile(profile = 'DEAD_LEG') { return PROFILES[profile] || PROFILES.DEAD_LEG },
  reset() {
    clearWatch()
    points = []
    lastAcceptedAt = 0
    active = null
  }
}
