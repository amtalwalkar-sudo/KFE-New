import { LocationRepository } from '../../repositories/locationRepository.js'
import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'

const uniqueParts = parts => [...new Set(parts.filter(Boolean).map(value => String(value).trim()).filter(Boolean))]

const formatReverseGeocodeResult = data => {
  if (!data) return null

  // KFE wants locality-to-locality context (for example, "Andheri" or
  // "Bandra Kurla Complex"), not street addresses, postcodes, or city/state
  // detail. Prefer the provider's locality/suburb/neighbourhood fields.
  const locality = [
    data.localityName,
    data.locality,
    data.suburb,
    data.neighbourhood,
    data.neighborhood
  ].find(value => typeof value === 'string' && value.trim())

  if (locality) return locality.trim()

  // Some providers expose locality hierarchy only through administrative
  // entries. Use the first useful named locality, without falling back to
  // street/postcode/city/state formatting.
  const administrative = Array.isArray(data.localityInfo?.administrative)
    ? data.localityInfo.administrative.map(entry => entry?.name)
    : []

  return uniqueParts(administrative).find(value => value) || null
}

const getNativePlaceName = async ({ latitude, longitude }) => {
  try {
    const bridge = globalThis?.KFE_NATIVE_GEOCODER
    if (bridge?.reverseGeocode) {
      const result = await bridge.reverseGeocode({ latitude, longitude })
      const placeName = formatReverseGeocodeResult(result)
      if (placeName) return placeName
    }
  } catch (_) {}

  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`
    const response = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    const data = await response.json()
    return formatReverseGeocodeResult(data)
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
      // Coordinates are authoritative and are persisted immediately. Reverse geocoding
      // is enrichment only, so a slow/offline geocoder must never block a trip boundary.
      resolve(record)
      void getNativePlaceName({ latitude, longitude }).then(placeName => {
        if (placeName && record?.id) {
          await LocationRepository.updatePlaceName(record.id, placeName)
          if (entityType === 'TRIP' && (eventType === 'START' || eventType === 'END' || eventType === 'CANCELLED')) await ShiftTripRepository.updateTripLocationPlaceName(entityId, eventType, placeName)
        }
        return null
        return null
      }).catch(() => {})
    }, () => resolve(null), {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 8000
    })
  })
}
