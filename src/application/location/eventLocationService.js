import { LocationRepository } from '../../repositories/locationRepository.js'
import { CanonicalWorkBoundary } from '../work/canonicalWorkBoundary.js'
import { WorkRuntimePorts } from '../work/workRuntimePorts.js'

const RIDE_EVENTS = new Set(['PICKUP_START', 'TRIP_CANCELLED', 'TRIP_START', 'TRIP_END'])
const stableId = (entityType, entityId, eventType) => `event-location-${entityType}-${entityId}-${eventType}`
const nativeSnapshotId = (entityId, eventType) => `native-event-location-${entityId}-${eventType}`

/**
 * Captures and persists only event-time coordinates. Locality resolution is
 * deliberately absent here; it is initiated only by Timeline pull-to-refresh.
 */
export const EventLocationService = {
  captureForEvent(entityType, entityId, eventType, eventAt = null) {
    if (entityType !== 'TRIP' || !entityId || !RIDE_EVENTS.has(eventType)) return
    void (async () => {
      const prior = (await this.forEntity(entityType, entityId)).find(item => item.eventType === eventType)
      // Duplicate lifecycle delivery must not recapture GPS or initiate enrichment.
      if (prior) return

      // Android durably journals the event natively. A later Timeline read
      // discovers its snapshot; capture never polls for it or calls the network.
      if (await WorkRuntimePorts.tripBoundaryLocation.queueEventLocationCapture(entityType, entityId, eventType, eventAt)) return

      // Browser fallback uses one fresh fix and persists it locally first.
      const location = await WorkRuntimePorts.tripBoundaryLocation.captureOneShotLocation(eventAt)
      if (!location) return
      const snapshot = await LocationRepository.record({
        id: stableId(entityType, entityId, eventType),
        entityType,
        entityId,
        eventType,
        eventAt,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        capturedAt: location.capturedAt,
      })
      await this.persistNativeSnapshot(snapshot)
    })().catch(error => console.warn('Ride GPS capture failed:', entityId, eventType, error))
  },

  async forEntity(entityType, entityId) {
    return this.forEntities(entityType, [entityId])
  },

  async forEntities(entityType, entityIds = [], eventTypes = [...RIDE_EVENTS]) {
    const ids = [...new Set((entityIds || []).filter(Boolean))]
    if (!entityType || !ids.length) return []
    const allowed = new Set(ids)
    const requestedEvents = [...new Set((eventTypes || []).filter(eventType => RIDE_EVENTS.has(eventType)))]
    const nativeReads = WorkRuntimePorts.canonicalWork.isAvailable()
      ? await Promise.all(ids.flatMap(id => requestedEvents.map(eventType =>
          CanonicalWorkBoundary.getEventLocationSnapshot(nativeSnapshotId(id, eventType)).catch(() => null))))
      : []
    const localGroups = await Promise.all(ids.map(id => LocationRepository.forEntity(entityType, id).catch(() => [])))
    const byId = new Map()
    for (const item of [...localGroups.flat().filter(item => requestedEvents.includes(item.eventType)), ...nativeReads.filter(Boolean)]) {
      if (item?.id) byId.set(item.id, { ...byId.get(item.id), ...item })
    }
    return [...byId.values()]
      .filter(item => item.entityType === entityType && allowed.has(item.entityId))
      .sort((a, b) => Date.parse(a.capturedAt || 0) - Date.parse(b.capturedAt || 0))
  },

  async persistNativeSnapshot(snapshot) {
    if (!snapshot?.id) return false
    try {
      await CanonicalWorkBoundary.persistEventLocationSnapshot(snapshot)
      return true
    } catch (error) {
      console.warn('Ride GPS snapshot mirror failed:', snapshot.entityId, snapshot.eventType, error)
      return false
    }
  },
}
