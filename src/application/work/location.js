import { LocationRepository } from '../../repositories/locationRepository.js'

const getNativePlaceName = async ({ latitude, longitude }) => {
  try {
    const bridge = globalThis?.KFE_NATIVE_GEOCODER
    if (bridge?.reverseGeocode) {
      const result = await bridge.reverseGeocode({ latitude, longitude })
      return result?.placeName || null
    }
  } catch (_) {}
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    const data = await response.json()
    const parts = [data.locality, data.city, data.principalSubdivision].filter(Boolean)
    return parts.length ? [...new Set(parts)].join(', ') : (data.localityInfo?.administrative?.[1]?.name || null)
  } catch (_) {}
  return null
}

export async function captureLifecycleLocation({ entityType, entityId, eventType }) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(async position => {
      const latitude = position.coords.latitude
      const longitude = position.coords.longitude
      const capturedAt = new Date(position.timestamp || Date.now()).toISOString()
      const placeName = await getNativePlaceName({ latitude, longitude })
      try {
        resolve(await LocationRepository.record({
          entityType,
          entityId,
          eventType,
          latitude,
          longitude,
          accuracy: position.coords.accuracy,
          capturedAt,
          placeName
        }))
      } catch (_) { resolve(null) }
    }, () => resolve(null), {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 8000
    })
  })
}
