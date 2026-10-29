import { LocationRepository } from '../../repositories/locationRepository.js'
import { CanonicalWorkBoundary } from '../work/canonicalWorkBoundary.js'
import { captureTripBoundaryLocation, queueTripBoundaryEventLocation } from '../work/tripBoundaryLocation.js'

const RIDE_EVENTS = new Set(['PICKUP_START', 'TRIP_CANCELLED', 'TRIP_START', 'TRIP_END'])
const stableId = (entityType, entityId, eventType) => `event-location-${entityType}-${entityId}-${eventType}`

/** One offline-capable, one-shot GPS pathway for the four ride events. */
export const EventLocationService = {
  captureForEvent(entityType, entityId, eventType, eventAt = null) {
    if (entityType !== 'TRIP' || !entityId || !RIDE_EVENTS.has(eventType)) return
    void (async () => {
      const prior = (await this.forEntity(entityType, entityId)).find(item => item.eventType === eventType)
      if (prior) return
      // Android durably queues the event natively. Browser fallback uses one fix.
      if (await queueTripBoundaryEventLocation(entityType, entityId, eventType, eventAt)) return
      const location = await captureTripBoundaryLocation()
      if (!location) return
      const snapshot = await LocationRepository.record({
        id: stableId(entityType, entityId, eventType), entityType, entityId, eventType, eventAt,
        latitude: location.latitude, longitude: location.longitude,
        accuracy: location.accuracy, capturedAt: location.capturedAt,
      })
      await this.persistNativeSnapshot(snapshot)
    })().catch(error => console.warn('Ride GPS capture failed:', entityId, eventType, error))
  },
  async forEntity(entityType, entityId) { return this.forEntities(entityType, [entityId]) },
  async forEntities(entityType, entityIds = []) {
    const ids = [...new Set((entityIds || []).filter(Boolean))]
    if (!entityType || !ids.length) return []
    const [localGroups, native] = await Promise.all([
      Promise.all(ids.map(id => LocationRepository.forEntity(entityType, id).catch(() => []))),
      CanonicalWorkBoundary.listEventLocationSnapshots().catch(() => []),
    ])
    const allowed = new Set(ids)
    const byId = new Map()
    for (const item of [...localGroups.flat(), ...native.filter(item => item.entityType === entityType && allowed.has(item.entityId))]) {
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
