import { LocationRepository } from '../../repositories/locationRepository.js'
import { captureTripBoundaryLocation } from '../work/tripBoundaryLocation.js'
import { PhotonLocationNameAdapter, resolveLocationName } from './locationNameService.js'

const locationNameResolver = new PhotonLocationNameAdapter()

export const EventLocationService = {
  // Optional enrichment. Call only after the authoritative business record is saved.
  captureForEvent(entityType, entityId, eventType) {
    if (!entityType || !entityId || !eventType) return
    void (async () => {
      const existing = await LocationRepository.forEntity(entityType, entityId)
      if (existing.some(item => item.eventType === eventType)) return
      const location = await captureTripBoundaryLocation()
      if (!location) return
      const snapshot = await LocationRepository.record({
        entityType, entityId, eventType,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        capturedAt: location.capturedAt,
      })
      const placeName = await resolveLocationName(location, locationNameResolver)
      if (placeName) await LocationRepository.updatePlaceName(snapshot.id, placeName)
    })().catch(error => console.warn('Optional event GPS enrichment failed:', entityType, entityId, eventType, error))
  },
  async forEntity(entityType, entityId) {
    return LocationRepository.forEntity(entityType, entityId)
  },
  async resolveLabel(location) {
    return resolveLocationName(location, locationNameResolver)
  },
  async persistLabel(snapshotId, placeName) {
    return LocationRepository.updatePlaceName(snapshotId, placeName)
  }
}
