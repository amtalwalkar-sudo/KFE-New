import { LocationRepository } from '../../repositories/locationRepository.js'
import { CanonicalWorkBoundary } from '../work/canonicalWorkBoundary.js'
import { captureTripBoundaryLocation } from '../work/tripBoundaryLocation.js'
import { PhotonLocationNameAdapter, resolveLocationName } from './locationNameService.js'

const locationNameResolver = new PhotonLocationNameAdapter()

export const EventLocationService = {
  // Optional enrichment. Call only after the authoritative business record is saved.
  captureForEvent(entityType, entityId, eventType) {
    if (!entityType || !entityId || !eventType) return
    void (async () => {
      const existing = await this.forEntity(entityType, entityId)
      const prior = existing.find(item => item.eventType === eventType)
      if (prior) { await this.persistNativeSnapshot(prior); return }
      const location = await captureTripBoundaryLocation()
      if (!location) return
      const snapshot = await LocationRepository.record({
        entityType, entityId, eventType,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        capturedAt: location.capturedAt,
      })
      await this.persistNativeSnapshot(snapshot)
      const placeName = await resolveLocationName(location, locationNameResolver)
      if (placeName) await this.persistLabel(snapshot.id, placeName)
    })().catch(error => console.warn('Optional event GPS enrichment failed:', entityType, entityId, eventType, error))
  },
  async forEntity(entityType, entityId) {
    const [local, native] = await Promise.all([
      LocationRepository.forEntity(entityType, entityId),
      CanonicalWorkBoundary.listEventLocationSnapshots().catch(() => []),
    ])
    const byId = new Map()
    const snapshots = [...local, ...native.filter(item => item.entityType === entityType && item.entityId === entityId)]
      .sort((a, b) => Date.parse(a.updatedAt || a.createdAt || 0) - Date.parse(b.updatedAt || b.createdAt || 0))
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
  async persistLabel(snapshotId, placeName) {
    const updated = await LocationRepository.updatePlaceName(snapshotId, placeName)
    const local = await LocationRepository.getById(snapshotId).catch(() => null)
    if (local) {
      await this.persistNativeSnapshot(local)
      return updated
    }
    const native = await CanonicalWorkBoundary.listEventLocationSnapshots().catch(() => [])
    const record = native.find(item => item.id === snapshotId)
    if (record) await this.persistNativeSnapshot({ ...record, placeName: String(placeName).trim(), updatedAt: new Date().toISOString() })
    return updated
  },
  async persistTripBoundaryLabel(tripId, field, placeName) {
    return CanonicalWorkBoundary.updateTripBoundaryPlaceName({
      operationId: CanonicalWorkBoundary.createOperationId(),
      tripId, field, placeName,
    })
  }
}
