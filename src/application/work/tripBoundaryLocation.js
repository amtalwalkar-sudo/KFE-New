import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeTripBoundaryLocation = registerPlugin('KfeTripBoundaryLocation')

const normalize = value => {
  const latitude = Number(value?.latitude)
  const longitude = Number(value?.longitude)
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null
  const accuracy = value?.accuracy == null || value.accuracy === '' ? null : Number(value.accuracy)
  const timestamp = value?.capturedAt || value?.timestamp
  const capturedAt = timestamp ? new Date(timestamp).toISOString() : null
  return { latitude, longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null, capturedAt: capturedAt || new Date().toISOString(), placeName: null }
}

/**
 * Capture exactly one GPS fix at a trip boundary. This does not start a watch,
 * trace collector, background service, reverse geocoder, or routing request.
 * GPS_PROVIDER / browser geolocation can obtain a fix without internet access.
 */
export async function captureTripBoundaryLocation() {
  try {
    if (Capacitor.isNativePlatform()) {
      return normalize(await NativeTripBoundaryLocation.captureCurrentLocation())
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null
    return await new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        position => resolve(normalize({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: position.timestamp || Date.now()
        })),
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      )
    })
  } catch (_) { return null }
}
