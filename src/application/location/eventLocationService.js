import { LocationRepository } from '../../repositories/locationRepository.js'
import { CanonicalWorkBoundary } from '../work/canonicalWorkBoundary.js'
import { captureTripBoundaryLocation, queueTripBoundaryEventLocation } from '../work/tripBoundaryLocation.js'
import { LocalityResolutionService, resolveLocationNameDetailed, resolveLocationName } from './locationNameService.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
import { ConnectivityService } from '../../infrastructure/connectivity/connectivityService.js'

const locationNameResolver = new LocalityResolutionService()
let locationReconcileAttempt = null
let locationManualRefreshAttempt = null
let pendingEnrichmentCache = null
const MAX_MANUAL_LOCALITY_BATCH = 20
const NATIVE_SYNC_FIELDS = ['entityType', 'entityId', 'eventType', 'eventAt', 'latitude', 'longitude', 'accuracy', 'capturedAt', 'placeName', 'localityResolutionState', 'localityResolvedAt', 'localityProvider', 'localityAttemptCount', 'localityNextAttemptAt', 'localityLastError']
const nativeSnapshotMatches = (snapshot, nativeSnapshot) => Boolean(nativeSnapshot) &&
  NATIVE_SYNC_FIELDS.every(field => String(snapshot?.[field] ?? '') === String(nativeSnapshot?.[field] ?? ''))
const LOCATION_RECONCILIATION_KEY = 'kfe:trip-location-reconciliation:v1'
const LOCATION_ENRICHMENT_QUEUE_KEY = 'kfe:location-enrichment-queue:v1'
const LOCATION_INCREMENTAL_INDEX_KEY = 'kfe:location-enrichment-index:v1'
const NATIVE_MIRROR_RETRY_KEY = 'kfe:native-location-mirror-retry:v1'
const readPendingNativeMirrorIds = () => {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(NATIVE_MIRROR_RETRY_KEY) || '[]')
    return Array.isArray(parsed) ? [...new Set(parsed.filter(id => typeof id === 'string' && id))] : []
  } catch (_) { return [] }
}
const setPendingNativeMirror = (snapshotId, pending) => {
  if (!snapshotId) return
  try {
    const ids = new Set(readPendingNativeMirrorIds())
    if (pending) ids.add(snapshotId)
    else ids.delete(snapshotId)
    globalThis.localStorage?.setItem(NATIVE_MIRROR_RETRY_KEY, JSON.stringify([...ids]))
  } catch (_) {}
}
const readPendingEnrichmentIds = () => {
  if (pendingEnrichmentCache instanceof Set) return [...pendingEnrichmentCache]
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(LOCATION_ENRICHMENT_QUEUE_KEY) || '[]')
    pendingEnrichmentCache = new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string' && id) : [])
  } catch (_) { pendingEnrichmentCache = new Set() }
  return [...pendingEnrichmentCache]
}
const setPendingEnrichment = (snapshotId, pending) => {
  if (!snapshotId) return
  const ids = new Set(readPendingEnrichmentIds())
  const alreadyPending = ids.has(snapshotId)
  if (alreadyPending === pending) return
  if (pending) ids.add(snapshotId)
  else ids.delete(snapshotId)
  pendingEnrichmentCache = ids
  try { globalThis.localStorage?.setItem(LOCATION_ENRICHMENT_QUEUE_KEY, JSON.stringify([...ids])) }
  catch (_) { pendingEnrichmentCache = null }
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
        // Area-name lookup is manual-only. Preserve the saved coordinates in the
        // durable queue without making a network request during event capture.
        if (!String(prior.placeName || '').trim()) setPendingEnrichment(prior.id, true)
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
      if (!String(snapshot.placeName || '').trim()) setPendingEnrichment(snapshot.id, true)
    })().catch(error => console.warn('Optional event GPS enrichment failed:', entityType, entityId, eventType, error))
  },
  async forEntity(entityType, entityId) {
    const snapshots = await this.forEntities(entityType, [entityId])
    return snapshots
  },
  async forEntities(entityType, entityIds = []) {
    const knownNativeSnapshots = arguments.length > 2 ? arguments[2] : null
    const ids = [...new Set((entityIds || []).filter(Boolean))]
    if (!entityType || !ids.length) return []
    const [localGroups, native] = await Promise.all([
      Promise.all(ids.map(id => LocationRepository.forEntity(entityType, id))),
      knownNativeSnapshots ? Promise.resolve(knownNativeSnapshots) : CanonicalWorkBoundary.listEventLocationSnapshots().catch(() => []),
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
      setPendingNativeMirror(snapshot.id, false)
      return true
    } catch (error) {
      setPendingNativeMirror(snapshot.id, true)
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
      const migrationComplete = globalThis.localStorage?.getItem(LOCATION_RECONCILIATION_KEY) === 'complete'
      const incrementalIndexSeeded = globalThis.localStorage?.getItem(LOCATION_INCREMENTAL_INDEX_KEY) === 'complete'
      const nativeAvailable = CanonicalWorkBoundary.isNativeAvailable()
      const pendingMirrorIds = migrationComplete ? readPendingNativeMirrorIds() : []
      const pendingEnrichmentIds = migrationComplete ? readPendingEnrichmentIds() : []
      const incrementalIds = [...new Set([...pendingMirrorIds, ...pendingEnrichmentIds])]
      const needsNativeIndex = !migrationComplete || !incrementalIndexSeeded
      let nativeIndexReadSucceeded = !needsNativeIndex
      const nativeIndexPromise = needsNativeIndex
        ? CanonicalWorkBoundary.listEventLocationSnapshots().then(rows => { nativeIndexReadSucceeded = true; return rows }).catch(() => [])
        : Promise.all(incrementalIds.map(id => CanonicalWorkBoundary.getEventLocationSnapshot(id).catch(() => null))).then(rows => rows.filter(Boolean))
      const [nativeSnapshots, localSnapshots, trips] = await Promise.all([
        nativeIndexPromise,
        migrationComplete
          ? incrementalIndexSeeded
            ? Promise.all(incrementalIds.map(id => LocationRepository.getById(id).catch(() => null))).then(rows => rows.filter(Boolean))
            : LocationRepository.all().catch(() => [])
          : Promise.resolve([]),
        migrationComplete ? Promise.resolve([]) : ShiftTripRepository.getAllTrips(),
      ])
      const nativeById = new Map(nativeSnapshots.filter(item => item?.id).map(item => [item.id, item]))
      let snapshots = []
      let migrationSucceeded = true

      if (migrationComplete) {
        // After the one-time seed, reconcile only IDs in the durable enrichment
        // and native-mirror journals. Do not scan every IndexedDB GPS snapshot
        // or list every native snapshot on each foreground/resume event.
        const byId = new Map(nativeSnapshots.filter(item => item?.id).map(item => [item.id, item]))
        const pendingMirrorSet = new Set(pendingMirrorIds)
        for (const local of localSnapshots) {
          if (!local?.id) continue
          const native = byId.get(local.id)
          const localUpdatedAt = Date.parse(local.updatedAt || local.createdAt || 0) || 0
          const nativeUpdatedAt = Date.parse(native?.updatedAt || native?.createdAt || 0) || 0
          if (!native || pendingMirrorSet.has(local.id) || localUpdatedAt > nativeUpdatedAt) {
            byId.set(local.id, { ...(native || {}), ...local })
          }
        }
        for (const snapshotId of pendingMirrorIds) {
          if (!localSnapshots.some(item => item?.id === snapshotId)) setPendingNativeMirror(snapshotId, false)
        }
        snapshots = [...byId.values()]
      } else {
        // The legacy migration is a one-time full scan. Do not mark it complete
        // if a legacy snapshot failed to migrate; a later startup can safely retry.
        snapshots = await this.forEntities('TRIP', trips.map(trip => trip?.id), nativeSnapshots)
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
                byEvent.set(key, snapshot)
              } catch (error) {
                migrationSucceeded = false
                console.warn('Legacy trip GPS snapshot could not be migrated:', trip.id, boundary.eventType, error)
                continue
              }
            }
          }
        }
        snapshots = [...byEvent.values()]
      }

      for (const snapshot of snapshots) {
        if (!snapshot?.id) continue
        if (String(snapshot.placeName || '').trim()) setPendingEnrichment(snapshot.id, false)
        else setPendingEnrichment(snapshot.id, true)
        // Only mirror missing or materially different records. A routine
        // foreground/resume reconciliation must not rewrite every saved fix.
        const nativeSnapshot = nativeById.get(snapshot.id)
        if (nativeAvailable && !nativeSnapshotMatches(snapshot, nativeSnapshot)) {
          if (await this.persistNativeSnapshot(snapshot)) {
            nativeById.set(snapshot.id, { ...snapshot, updatedAt: snapshot.updatedAt || snapshot.createdAt || new Date().toISOString() })
          }
        }
        // Reconciliation is local-only: it never initiates locality network requests.
        // Reverse geocoding is available exclusively through the explicit manual refresh action.
      }

      if (!migrationComplete && migrationSucceeded) {
        try { globalThis.localStorage?.setItem(LOCATION_RECONCILIATION_KEY, 'complete') } catch (_) {}
      }
      if (!incrementalIndexSeeded && nativeIndexReadSucceeded && migrationSucceeded) {
        // Seed every existing unresolved native snapshot exactly once, including
        // non-trip events. Subsequent reconciliations operate on queued IDs only.
        for (const snapshot of [...nativeSnapshots, ...localSnapshots]) {
          if (snapshot?.id && !String(snapshot.placeName || '').trim()) setPendingEnrichment(snapshot.id, true)
        }
        for (const snapshot of snapshots) {
          if (snapshot?.id && !String(snapshot.placeName || '').trim()) setPendingEnrichment(snapshot.id, true)
        }
        try { globalThis.localStorage?.setItem(LOCATION_INCREMENTAL_INDEX_KEY, 'complete') } catch (_) {}
      }
      return { migrated: !migrationComplete, tripCount: trips.length, snapshotCount: snapshots.length }
    })().finally(() => { locationReconcileAttempt = null })
    return locationReconcileAttempt
  },
  async refreshUnresolvedLocationNames({ limit = MAX_MANUAL_LOCALITY_BATCH } = {}) {
    if (locationManualRefreshAttempt) return locationManualRefreshAttempt
    locationManualRefreshAttempt = (async () => {
      // Run local migration/index repair first. This method performs no network I/O.
      await this.reconcilePersistedTripLocations()
      if (!ConnectivityService.isNetworkAvailable()) {
        return { online: false, attempted: 0, updated: 0, unresolved: readPendingEnrichmentIds().length, remaining: readPendingEnrichmentIds().length }
      }
      const batchLimit = Math.max(1, Math.min(MAX_MANUAL_LOCALITY_BATCH, Math.floor(Number(limit) || MAX_MANUAL_LOCALITY_BATCH)))
      const ids = readPendingEnrichmentIds().slice(0, batchLimit)
      let attempted = 0
      let updated = 0
      let unresolved = 0
      for (const id of ids) {
        let snapshot = await LocationRepository.getById(id).catch(() => null)
        if (!snapshot) snapshot = await CanonicalWorkBoundary.getEventLocationSnapshot(id).catch(() => null)
        if (!snapshot?.id) {
          setPendingEnrichment(id, false)
          continue
        }
        if (String(snapshot.placeName || '').trim()) {
          setPendingEnrichment(id, false)
          continue
        }
        attempted += 1
        try {
          const result = await resolveLocationNameDetailed(snapshot, locationNameResolver)
          if (String(result.placeName || '').trim()) {
            await this.persistLabel(id, result.placeName)
            updated += 1
          } else {
            unresolved += 1
          }
        } catch (error) {
          unresolved += 1
          console.warn('Manual locality lookup failed; saved coordinates remain available:', id, error)
        }
      }
      return { online: true, attempted, updated, unresolved, remaining: readPendingEnrichmentIds().length }
    })().finally(() => { locationManualRefreshAttempt = null })
    return locationManualRefreshAttempt
  },
  async persistResolutionState(snapshotId, metadata) {
    if (!snapshotId || !metadata) return false
    const updated = await LocationRepository.updateLocalityResolution(snapshotId, metadata).catch(() => false)
    const local = await LocationRepository.getById(snapshotId).catch(() => null)
    if (local) await this.persistNativeSnapshot(local)
    else {
      const record = await CanonicalWorkBoundary.getEventLocationSnapshot(snapshotId).catch(() => null)
      if (record) await this.persistNativeSnapshot({ ...record, ...metadata, updatedAt: new Date().toISOString() })
    }
    return updated
  },
  async persistLabel(snapshotId, placeName) {
    setPendingEnrichment(snapshotId, false)
    const updated = await LocationRepository.updatePlaceName(snapshotId, placeName)
    const local = await LocationRepository.getById(snapshotId).catch(() => null)
    if (local) {
      await this.persistNativeSnapshot(local)
      return updated
    }
    const record = await CanonicalWorkBoundary.getEventLocationSnapshot(snapshotId).catch(() => null)
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
