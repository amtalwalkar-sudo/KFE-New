import { LocationRepository } from '../../repositories/locationRepository.js'

const uniqueParts = parts => [...new Set(parts.filter(Boolean).map(value => String(value).trim()).filter(Boolean))]

const formatReverseGeocodeResult = data => {
  if (!data) return null

  const directPlace = [
    data.formattedAddress,
    data.formatted_address,
    data.displayName?.text,
    data.display_name,
    data.address
  ].find(value => typeof value === 'string' && value.trim())

  if (directPlace) return directPlace.trim()

  // BigDataCloud exposes the more useful suburb/locality as "locality".
  // Keep it ahead of city/state so KFE does not collapse a precise fix to
  // the broad city name.
  const locality = data.localityName || data.locality || data.suburb || data.neighbourhood || data.neighborhood
  const street = data.road || data.street || data.route || data.streetName
  const postcode = data.postcode || data.postalCode
  const city = data.city || data.localityInfo?.administrative?.find(entry => entry?.adminLevel === 4)?.name
  const state = data.principalSubdivision || data.state

  const granular = uniqueParts([street, locality, postcode, city, state])
  if (granular.length) return granular.join(', ')

  const administrative = Array.isArray(data.localityInfo?.administrative)
    ? data.localityInfo.administrative.map(entry => entry?.name)
    : []

  return uniqueParts(administrative).slice(0, 3).join(', ') || null
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
