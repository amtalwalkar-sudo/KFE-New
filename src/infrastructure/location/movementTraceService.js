import { LocationRepository } from '../../repositories/locationRepository.js'

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


const toRadians = value => Number(value) * Math.PI / 180
const segmentKm = (a, b) => {
  if (!a || !b) return 0
  const lat1 = toRadians(a.latitude); const lat2 = toRadians(b.latitude)
  const dLat = lat2 - lat1; const dLon = toRadians(b.longitude) - toRadians(a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}
export const calculateTraceDistanceKm = tracePoints => (tracePoints || []).reduce((total, point, index, list) => total + (index ? segmentKm(list[index - 1], point) : 0), 0)

let watchId = null
let points = []
let lastAcceptedAt = 0
let active = null
let pendingWrites = Promise.resolve()
let lastPersistenceError = null
let persistenceFailureCount = 0
let traceGeneration = 0
const SESSION_KEY = 'kfe.movement-trace-session.v1'
const saveSession = () => { if (typeof localStorage === 'undefined' || !active) return; localStorage.setItem(SESSION_KEY, JSON.stringify({ entityType: active.entityType, entityId: active.entityId, eventType: active.eventType, profile: Object.entries(PROFILES).find(([, value]) => value === active.profile)?.[0] || 'DEAD_LEG' })) }
const clearSession = () => { try { localStorage.removeItem(SESSION_KEY) } catch (_) {} }
const readSession = () => { try { const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); return value?.entityType && value?.entityId ? value : null } catch (_) { return null } }

const persist = point => {
  if (!active || !point) return
  const generation = active.generation
  const session = { entityType: active.entityType, entityId: active.entityId, eventType: active.eventType }
  const write = async () => {
    let lastError = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { await LocationRepository.recordTracePoint({ ...session, ...point }); return }
      catch (error) { lastError = error; if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 250)) }
    }
    if (active?.generation === generation) {
      lastPersistenceError = lastError || new Error('GPS trace persistence failed.')
      persistenceFailureCount += 1
    }
  }
  pendingWrites = pendingWrites.catch(() => {}).then(write)
  return pendingWrites
}

const accept = point => {
  if (!active || !point) return false
  const now = Date.now()
  if (now - lastAcceptedAt < active.profile.intervalMs) return false
  if (point.accuracy != null && point.accuracy > 100) return false
  const previous = points.at(-1)
  if (previous?.capturedAt === point.capturedAt) return false
  points.push(point)
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
  if (typeof navigator === 'undefined' || !navigator.geolocation || !active) return resolve(null)
  const session = active
  const generation = session.generation
  const options = session.profile
  navigator.geolocation.getCurrentPosition(position => {
    const point = normalizePoint(position)
    if (generation !== active?.generation) return resolve(null)
    if (point && (!point.accuracy || point.accuracy <= 100)) {
      const previous = points.at(-1)
      if (previous?.capturedAt !== point.capturedAt) {
        points.push(point)
        lastAcceptedAt = Date.now()
        void persist(point)
        active?.onPoint?.(point, points.length, calculateTraceDistanceKm(points))
      }
    }
    resolve(point)
  }, () => resolve(null), { ...options, maximumAge: 0 })
})

export const MovementTraceService = {
  profiles: PROFILES,
  start({ entityType, entityId, eventType = 'MOVEMENT_TRACE', profile = 'DEAD_LEG', onPoint } = {}) {
    this.reset()
    if (!entityType || !entityId || typeof navigator === 'undefined' || !navigator.geolocation?.watchPosition) return false
    active = { entityType, entityId, eventType, profile: PROFILES[profile] || PROFILES.DEAD_LEG, onPoint, generation: ++traceGeneration }
    saveSession()
    watchId = navigator.geolocation.watchPosition(position => accept(normalizePoint(position)), () => {}, { ...active.profile })
    void captureBoundary()
    return true
  },
  async stop({ captureFinal = true } = {}) {
    if (!active) {
      await pendingWrites
      return [...points]
    }
    if (captureFinal) await captureBoundary()
    clearWatch()
    const result = [...points]
    await pendingWrites
    const persistenceError = lastPersistenceError
    const persistenceFailures = persistenceFailureCount
    active = null
    clearSession()
    lastPersistenceError = null
    persistenceFailureCount = 0
    if (persistenceError) {
      persistenceError.persistenceFailureCount = persistenceFailures
      throw persistenceError
    }
    return result
  },
  getPoints() { return [...points] },
  getActiveSession() { return active ? { entityType: active.entityType, entityId: active.entityId, eventType: active.eventType, profile: Object.entries(PROFILES).find(([, value]) => value === active.profile)?.[0] || 'DEAD_LEG' } : readSession() },
  hasActiveTrace() { return Boolean(active || readSession()) },
  getPointCount() { return points.length },
  getDistanceKm() { return calculateTraceDistanceKm(points) },
  getLastPersistenceError() { return lastPersistenceError },
  getPersistenceFailureCount() { return persistenceFailureCount },
  getProfile(profile = 'DEAD_LEG') { return PROFILES[profile] || PROFILES.DEAD_LEG },
  reset() {
    traceGeneration += 1
    clearWatch()
    points.length = 0
    lastAcceptedAt = 0
    active = null
    lastPersistenceError = null
    persistenceFailureCount = 0
    clearSession()
  }
}
