import { LocationRepository } from '../../repositories/locationRepository.js'

export async function captureLifecycleLocation({ entityType, entityId, eventType }) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(async position => {
      const latitude = position.coords.latitude
      const longitude = position.coords.longitude
      const capturedAt = new Date(position.timestamp || Date.now()).toISOString()
      let record = null
      try {
        record = await LocationRepository.record({
          entityType,
          entityId,
          eventType,
          latitude,
          longitude,
          accuracy: position.coords.accuracy,
          capturedAt,
          placeName: null
        })
      } catch (_) { resolve(null); return }
      // Local coordinates and the GPS fix timestamp are the complete snapshot.
      // No reverse-geocoder request is made, so this path is offline-first.
      resolve(record)
    }, () => resolve(null), {
      enableHighAccuracy: true,
      maximumAge: eventType === 'RIDE_START' || eventType === 'END' ? 0 : 30000,
      timeout: 30000
    })
  })
}
