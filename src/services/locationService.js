import { ActivityDetectionService } from './activityDetectionService.js'

const GPS_INTERVALS_MS = Object.freeze({ WAITING: 7 * 60 * 1000, TRIP_ACTIVE: 9 * 60 * 1000, BETWEEN_TRIPS_MOVING: 2 * 60 * 1000, BETWEEN_TRIPS_STATIONARY: 6 * 60 * 1000 })
const MOVEMENT_SPEED_KMH = 2
// Watch callbacks are movement signals only; persisted snapshots remain state-cadenced.
const GPS_WATCH_OPTIONS = Object.freeze({ enableHighAccuracy: false, maximumAge: 30000, timeout: 15000 })
let lastSnapshotAt = 0
let timer = null
let watchId = null
let activeHandler = null
let currentState = 'WAITING'
let foregroundService = null

export const deriveBetweenTripGpsState = (location) => { const speed = Number(location?.speed); return Number.isFinite(speed) && speed > MOVEMENT_SPEED_KMH ? 'BETWEEN_TRIPS_MOVING' : 'BETWEEN_TRIPS_STATIONARY' }
const normalizePosition = position => ({ latitude: Number(position.coords.latitude), longitude: Number(position.coords.longitude), accuracy: Number(position.coords.accuracy), speed: Number.isFinite(position.coords.speed) ? Number(position.coords.speed) : null, bearing: Number.isFinite(position.coords.heading) ? Number(position.coords.heading) : null, timestamp: new Date(position.timestamp || Date.now()).toISOString() })
const readPosition = (options = {}) => new Promise(resolve => { if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null); navigator.geolocation.getCurrentPosition(position => resolve(normalizePosition(position)), () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000, ...options }) })
const startAndroidForegroundService = async () => { try { const { Capacitor } = await import('@capacitor/core'); if (Capacitor.getPlatform() !== 'android') return; const module = await import('@capawesome-team/capacitor-android-foreground-service'); foregroundService = module.ForegroundService; await foregroundService.requestPermissions(); await foregroundService.startForegroundService({ id: 7102, title: 'KFE — Shift Active', body: 'Location snapshots are active for shift movement calculation.', foregroundServiceType: 'location' }) } catch (error) { console.warn('Android foreground location service unavailable; Shift continues without blocking.', error) } }
const stopAndroidForegroundService = async () => { try { if (foregroundService) await foregroundService.stopForegroundService() } catch (error) { console.warn('Unable to stop Android foreground location service.', error) } finally { foregroundService = null } }

const runHandlerSafely = async (handler, location) => {
  try {
    return await handler(location)
  } catch (error) {
    console.warn('KFE location snapshot handler failed; cadence will continue.', error)
    return null
  }
}

const applyMovementState = location => { if (!location || currentState === 'WAITING' || currentState === 'TRIP_ACTIVE') return; const next = deriveBetweenTripGpsState(location); if (next !== currentState) { currentState = next; schedule() } }
const handleWatchedLocation = async location => { if (!activeHandler || !location) return; applyMovementState(location); const now = Date.now(); if (now - lastSnapshotAt < GPS_INTERVALS_MS[currentState]) return; lastSnapshotAt = now; await runHandlerSafely(activeHandler, location) }
const startNativeWatch = () => { if (typeof navigator === 'undefined' || !navigator.geolocation || typeof navigator.geolocation.watchPosition !== 'function') return; watchId = navigator.geolocation.watchPosition(position => { void handleWatchedLocation(normalizePosition(position)) }, () => {}, GPS_WATCH_OPTIONS) }
const stopNativeWatch = () => { if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation?.clearWatch) navigator.geolocation.clearWatch(watchId); watchId = null }
const capture = async (handler, force = false) => { const now = Date.now(); if (!force && now - lastSnapshotAt < GPS_INTERVALS_MS[currentState]) return null; const location = await readPosition(); if (location) { lastSnapshotAt = now; applyMovementState(location); await runHandlerSafely(handler, location) } return location }
const schedule = () => { if (timer !== null && typeof window !== 'undefined') window.clearTimeout(timer); if (!activeHandler || typeof window === 'undefined') return; timer = window.setTimeout(async () => { if (activeHandler) await capture(activeHandler); if (activeHandler) schedule() }, GPS_INTERVALS_MS[currentState]) }

export const LocationService = {
  captureLocation: readPosition,
  getState() { return currentState },
  getIntervals() { return { ...GPS_INTERVALS_MS } },
  setState(state) { if (!GPS_INTERVALS_MS[state]) throw new Error(`Unsupported GPS state: ${state}`); currentState = state; if (activeHandler) schedule() },
  async capturePeriodicSnapshot(handler, { force = false } = {}) { return capture(handler, force) },
  async captureBoundarySnapshot(handler) { return capture(handler, true) },
  startActiveShiftSnapshots(handler, state = 'WAITING') { this.stopActiveShiftSnapshots(); activeHandler = handler; currentState = state; void startAndroidForegroundService(); startNativeWatch(); void ActivityDetectionService.start(() => { if (currentState === 'BETWEEN_TRIPS_STATIONARY') this.setState('BETWEEN_TRIPS_MOVING') }); void capture(activeHandler, true); schedule() },
  stopActiveShiftSnapshots() { if (timer !== null && typeof window !== 'undefined') window.clearTimeout(timer); timer = null; stopNativeWatch(); activeHandler = null; ActivityDetectionService.stop(); void stopAndroidForegroundService() },
  startActiveTripSnapshots(handler) { this.startActiveShiftSnapshots(handler, 'TRIP_ACTIVE') },
  stopActiveTripSnapshots() { this.stopActiveShiftSnapshots() },
  reset() { lastSnapshotAt = 0; currentState = 'WAITING'; this.stopActiveShiftSnapshots() }
}
export const LOCATION_SNAPSHOT_INTERVAL_MS = GPS_INTERVALS_MS.WAITING
export const LOCATION_SNAPSHOT_INTERVALS_MS = GPS_INTERVALS_MS
export const GPS_MOVEMENT_SPEED_THRESHOLD_KMH = MOVEMENT_SPEED_KMH
export const GPS_WATCH_OPTIONS_CONFIG = GPS_WATCH_OPTIONS
