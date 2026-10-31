import { LocationRepository } from '../../repositories/locationRepository.js'
import { CanonicalWorkBoundary } from '../work/canonicalWorkBoundary.js'
import { WorkRuntimePorts } from '../work/workRuntimePorts.js'
import { EventLocalityService } from './eventLocalityService.js'

const RIDE_EVENTS = new Set(['PICKUP_START', 'TRIP_CANCELLED', 'TRIP_START', 'TRIP_END'])
const stableId = (entityType, entityId, eventType) => `event-location-${entityType}-${entityId}-${eventType}`
const nativeSnapshotId = (entityId, eventType) => `native-event-location-${entityId}-${eventType}`
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

/** One offline-capable, one-shot GPS pathway for the four ride events. */
export const EventLocationService = {
  captureForEvent(entityType, entityId, eventType, eventAt = null) {
    if (entityType !== 'TRIP' || !entityId || !RIDE_EVENTS.has(eventType)) return
    void (async () => {
      const prior = (await this.forEntity(entityType, entityId)).find(item => item.eventType === eventType)
      if (prior) { void EventLocalityService.resolveSnapshot(prior); return }
      // Android durably queues the event natively. Browser fallback uses one fix.
      if (await WorkRuntimePorts.tripBoundaryLocation.queueEventLocationCapture(entityType, entityId, eventType, eventAt)) {
        void this.resolveNativeSnapshotAfterCapture(entityId, eventType)
        return
      }
      const location = await WorkRuntimePorts.tripBoundaryLocation.captureOneShotLocation(eventAt)
      if (!location) return
      const snapshot = await LocationRepository.record({
        id: stableId(entityType, entityId, eventType), entityType, entityId, eventType, eventAt,
        latitude: location.latitude, longitude: location.longitude,
        accuracy: location.accuracy, capturedAt: location.capturedAt,
      })
      await this.persistNativeSnapshot(snapshot)
      void EventLocalityService.resolveSnapshot(snapshot)
    })().catch(error => console.warn('Ride GPS capture failed:', entityId, eventType, error))
  },
  async resolveNativeSnapshotAfterCapture(entityId, eventType) {
    const delays = [250, 500, 1000, 2000, 4000, 6000, 8000, 8000]
    for (const delay of delays) {
      await wait(delay)
      const snapshot = await CanonicalWorkBoundary.getEventLocationSnapshot(nativeSnapshotId(entityId, eventType)).catch(() => null)
      if (snapshot?.id && snapshot?.capturedAt) {
        void EventLocalityService.resolveSnapshot(snapshot)
        return snapshot
      }
    }
    return null
  },
  async forEntity(entityType, entityId) { return this.forEntities(entityType, [entityId]) },
  async forEntities(entityType, entityIds = []) {
    const ids = [...new Set((entityIds || []).filter(Boolean))]
    if (!entityType || !ids.length) return []
    const nativeReads = WorkRuntimePorts.canonicalWork.isAvailable()
      ? await Promise.all(ids.flatMap(id => [...RIDE_EVENTS].map(eventType => CanonicalWorkBoundary.getEventLocationSnapshot(nativeSnapshotId(id, eventType)).catch(() => null))))
      : []
    const localGroups = await Promise.all(ids.map(id => LocationRepository.forEntity(entityType, id).catch(() => [])))
    const byId = new Map()
    for (const item of [...localGroups.flat(), ...nativeReads.filter(Boolean)]) {
      if (item?.id) byId.set(item.id, { ...byId.get(item.id), ...item })
    }
    return [...byId.values()].filter(item => item.entityType === entityType && allowed.has(item.entityId))
      .sort((a, b) => Date.parse(a.capturedAt || 0) - Date.parse(b.capturedAt || 0))
  },
  async persistNativeSnapshot(snapshot) {
    if (!snapshot?.id) return false
    try { await CanonicalWorkBoundary.persistEventLocationSnapshot(snapshot); return true }
    catch (error) {
      console.warn('Ride GPS snapshot mirror failed:', snapshot.entityId, snapshot.eventType, error)
      return false
    }
  },
}
