import { LocationRepository } from '../../repositories/locationRepository.js'
import { CanonicalWorkBoundary } from '../work/canonicalWorkBoundary.js'
import { captureTripBoundaryLocation, queueTripBoundaryEventLocation } from '../work/tripBoundaryLocation.js'
import { PhotonLocationNameAdapter, resolveLocationName } from './locationNameService.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
import { ConnectivityService } from '../../infrastructure/connectivity/connectivityService.js'

const locationNameResolver = new PhotonLocationNameAdapter()
let locationReconcileAttempt = null
let locationRetryTimer = null
const LOCATION_RETRY_KEY = 'kfe:location-name-retry:v1'
const LOCATION_RETRY_DELAYS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000]

const readLocationRetryState = () => {
  try {
    const value = globalThis.localStorage?.getItem(LOCATION_RETRY_KEY)
    const parsed = value ? JSON.parse(value) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (_) { return {} }
}
const writeLocationRetryState = state => {
  try { globalThis.localStorage?.setItem(LOCATION_RETRY_KEY, JSON.stringify(state)) } catch (_) {}
}
const scheduleNextLocationRetry = () => {
  if (locationRetryTimer != null || typeof globalThis.setTimeout !== 'function') return
  const state = readLocationRetryState()
  const next = Object.values(state).map(item => Number(item?.nextAttemptAt)).filter(value => Number.isFinite(value) && value > Date.now()).sort((a, b) => a - b)[0]
  if (!next) return
  locationRetryTimer = globalThis.setTimeout(() => {
    locationRetryTimer = null
    if (!ConnectivityService.isNetworkAvailable()) return
    void EventLocationService.reconcilePersistedTripLocations().catch(error => console.warn('Scheduled GPS locality retry deferred:', error))
  }, Math.max(1, next - Date.now()))
}
const clearLocationRetry = snapshotId => {
  if (!snapshotId) return
  const state = readLocationRetryState()
  if (!(snapshotId in state)) return
  delete state[snapshotId]
  writeLocationRetryState(state)
  if (locationRetryTimer != null && typeof globalThis.clearTimeout === 'function') {
    globalThis.clearTimeout(locationRetryTimer)
    locationRetryTimer = null
  }
  scheduleNextLocationRetry()
}
const resolveLocationNameWithRetry = async (snapshot, resolver) => {
  if (!ConnectivityService.isNetworkAvailable() || !snapshot?.id) return null
  const state = readLocationRetryState()
  const retry = state[snapshot.id]
  if (retry && (Number(retry.attempts) > LOCATION_RETRY_DELAYS.length || Number(retry.nextAttemptAt) > Date.now())) {
    scheduleNextLocationRetry()
    return null
  }
  const placeName = await resolveLocationName(snapshot, resolver)
  if (placeName) {
    clearLocationRetry(snapshot.id)
    return placeName
  }
  const attempts = Math.max(0, Number(retry?.attempts) || 0) + 1
  state[snapshot.id] = {
    attempts,
    nextAttemptAt: attempts <= LOCATION_RETRY_DELAYS.length ? Date.now() + LOCATION_RETRY_DELAYS[attempts - 1] : null,
  }
  writeLocationRetryState(state)
  scheduleNextLocationRetry()
  return null
}

export const EventLocationService = {
  // Optional enrichment. Call only after the authoritative business record is saved.
  captureForEvent(entityType, entityId, eventType, eventAt = null) {
    if (!entityType || !entityId || !eventType) return
    void (async () => {
      const existing = await this.forEntity(entityType, entityId)
      const prior = existing.find(item => item.eventType === eventType)
      if (prior) {
        await this.persistNativeSnapshot(prior)
        // A previous capture may have succeeded while reverse geocoding was
        // unavailable. Retry enrichment from its persisted coordinates; never
        // take a second GPS fix for the same event.
        if (!String(prior.placeName || '').trim()) {
          const placeName = await resolveLocationNameWithRetry(prior, locationNameResolver)
          if (placeName) await this.persistLabel(prior.id, placeName)
        }
        return
      }
      // On Android, queue the event in native durable storage first. The native
      // service retries only when precise + background permissions are granted;
      // it survives WebView reloads and keeps the original event identity.
      if (await queueTripBoundaryEventLocation(entityType, entityId, eventType, eventAt)) return
      const location = await captureTripBoundaryLocation()
      if (!location) return
      const snapshot = await LocationRepository.record({
        id: entityType === 'TRIP' ? `native-event-location-${entityId}-${eventType}` : `event-location-${entityType}-${entityId}-${eventType}`,
        entityType, entityId, eventType, eventAt,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        capturedAt: location.capturedAt,
      })
      await this.persistNativeSnapshot(snapshot)
      const placeName = await resolveLocationNameWithRetry(snapshot, locationNameResolver)
      if (placeName) await this.persistLabel(snapshot.id, placeName)
    })().catch(error => console.warn('Optional event GPS enrichment failed:', entityType, entityId, eventType, error))
  },
  async forEntity(entityType, entityId) {
    const snapshots = await this.forEntities(entityType, [entityId])
    return snapshots
  },
  async forEntities(entityType, entityIds = []) {
    const ids = [...new Set((entityIds || []).filter(Boolean))]
    if (!entityType || !ids.length) return []
    const [localGroups, native] = await Promise.all([
      Promise.all(ids.map(id => LocationRepository.forEntity(entityType, id))),
      CanonicalWorkBoundary.listEventLocationSnapshots().catch(() => []),
    ])
    const allowed = new Set(ids)
    const byId = new Map()
    const snapshots = [
      ...localGroups.flat(),
      ...native.filter(item => item.entityType === entityType && allowed.has(item.entityId)),
    ].sort((a, b) => Date.parse(a.updatedAt || a.createdAt || 0) - Date.parse(b.updatedAt || b.createdAt || 0))
    for (const item of snapshots) {
      if (item?.id) byId.set(item.id, { ...byId.get(item.id), ...item })
    }
    return [...byId.values()].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
  },
  async persistNativeSnapshot(snapshot) {
    if (!snapshot?.id) return false
    const record = { ...snapshot, updatedAt: snapshot.updatedAt || snapshot.createdAt || new Date().toISOString() }
    try {
      await CanonicalWorkBoundary.persistEventLocationSnapshot(record)
      return true
    } catch (error) {
      console.warn('Native event GPS snapshot mirror failed:', snapshot.entityType, snapshot.entityId, snapshot.eventType, error)
      return false
    }
  },
  async resolveLabel(location) {
    return resolveLocationName(location, locationNameResolver)
  },
  async reconcilePersistedTripLocations() {
    if (locationReconcileAttempt) return locationReconcileAttempt
    locationReconcileAttempt = (async () => {
      const trips = await ShiftTripRepository.getAllTrips()
      const snapshots = await this.forEntities('TRIP', trips.map(trip => trip?.id))
      const byEvent = new Map(snapshots.map(snapshot => [`${snapshot.entityId}:${snapshot.eventType}`, snapshot]))
      for (const trip of trips) {
        if (!trip?.id) continue
        for (const boundary of [
          { field: 'tripStartLocation', eventType: 'TRIP_START', eventAt: trip.tripStartAt },
          { field: 'tripEndLocation', eventType: 'TRIP_END', eventAt: trip.tripEndAt },
          { field: null, eventType: 'PICKUP_START', eventAt: trip.createdAt || trip.tripStartAt },
          { field: null, eventType: 'TRIP_CANCELLED', eventAt: trip.tripEndAt },
        ]) {
          const key = `${trip.id}:${boundary.eventType}`
          let snapshot = byEvent.get(key)
          const legacy = boundary.field ? trip[boundary.field] : null
          // Reuse the original fix for old records; never take a new GPS reading
          // just to repair a missing locality label.
          const latitude = legacy?.latitude == null || legacy.latitude === '' ? NaN : Number(legacy.latitude)
          const longitude = legacy?.longitude == null || legacy.longitude === '' ? NaN : Number(legacy.longitude)
          if (!snapshot && legacy && Number.isFinite(latitude) && Math.abs(latitude) <= 90
            && Number.isFinite(longitude) && Math.abs(longitude) <= 180 && legacy.capturedAt) {
            try {
              snapshot = await LocationRepository.record({
                id: `legacy-trip-location-${trip.id}-${boundary.eventType}`,
                entityType: 'TRIP', entityId: trip.id, eventType: boundary.eventType,
                eventAt: boundary.eventAt || null,
                latitude, longitude, accuracy: legacy.accuracy,
                capturedAt: legacy.capturedAt, placeName: legacy.placeName || null,
              })
              await this.persistNativeSnapshot(snapshot)
              byEvent.set(key, snapshot)
            } catch (error) {
              console.warn('Legacy trip GPS snapshot could not be migrated:', trip.id, boundary.eventType, error)
              continue
            }
          }
          if (!snapshot) continue
          // Reconcile a local-only snapshot to native canonical storage after
          // interrupted mirroring, and safely replay the same idempotent write
          // when the native store already owns it.
          await this.persistNativeSnapshot(snapshot)
          if (String(snapshot.placeName || '').trim() || !ConnectivityService.isNetworkAvailable()) continue
          const placeName = await resolveLocationNameWithRetry(snapshot, locationNameResolver)
          if (placeName) await this.persistLabel(snapshot.id, placeName)
        }
      }
      return { migrated: true, tripCount: trips.length }
    })().finally(() => { locationReconcileAttempt = null })
    return locationReconcileAttempt
  },
  async persistLabel(snapshotId, placeName) {
    clearLocationRetry(snapshotId)
    const updated = await LocationRepository.updatePlaceName(snapshotId, placeName)
    const local = await LocationRepository.getById(snapshotId).catch(() => null)
    if (local) {
      await this.persistNativeSnapshot(local)
      return updated
    }
    const native = await CanonicalWorkBoundary.listEventLocationSnapshots().catch(() => [])
    const record = native.find(item => item.id === snapshotId)
    if (record) {
      const persisted = await this.persistNativeSnapshot({ ...record, placeName: String(placeName).trim(), updatedAt: new Date().toISOString() })
      if (persisted) {
        const { notifyCanonicalDataChanged } = await import('../../utils/indexedDB.js')
        notifyCanonicalDataChanged({ stores: ['gps_snapshots'], reason: 'native-gps-place-name-enriched' })
      }
    }
    return updated
  },
}

// Connectivity changes wake the persisted enrichment queue. Coordinates and
// business event timestamps have already been saved and never depend on this.
ConnectivityService.subscribe((status, reason) => {
  if (!status.networkAvailable || !['online', 'resume', 'foreground'].includes(reason)) return
  const retries = readLocationRetryState()
  let changed = false
  for (const retry of Object.values(retries)) {
    if (retry && Number(retry.attempts) <= LOCATION_RETRY_DELAYS.length) {
      retry.nextAttemptAt = Date.now()
      changed = true
    }
  }
  if (changed) writeLocationRetryState(retries)
  if (locationRetryTimer != null && typeof globalThis.clearTimeout === 'function') {
    globalThis.clearTimeout(locationRetryTimer)
    locationRetryTimer = null
  }
  void EventLocationService.reconcilePersistedTripLocations()
    .catch(error => console.warn('Connectivity-triggered GPS locality enrichment deferred:', error))
}, { emitCurrent: false })
