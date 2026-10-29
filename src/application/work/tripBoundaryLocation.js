import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeTripBoundaryLocation = registerPlugin('KfeTripBoundaryLocation')

export const normalizeTripBoundaryLocation = value => {
  const latitude = Number(value?.latitude)
  const longitude = Number(value?.longitude)
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null
  const accuracy = value?.accuracy == null || value.accuracy === '' ? null : Number(value.accuracy)
  const timestamp = value?.capturedAt ?? value?.timestamp
  if (timestamp == null || timestamp === '') return null
  const fixDate = new Date(timestamp)
  if (!Number.isFinite(fixDate.getTime()) || fixDate.getTime() <= 0) return null
  // Provider accuracy is a radius in metres; negative values are corrupt metadata,
  // not a usable accuracy estimate. Keep the fix but mark accuracy unknown.
  if (!Number.isFinite(accuracy) || accuracy < 0) return null
  const normalizedAccuracy = accuracy
  return { latitude, longitude, accuracy: normalizedAccuracy, capturedAt: fixDate.toISOString(), placeName: null }
}

/**
 * Capture exactly one GPS fix at a trip boundary. This does not start a watch,
 * trace collector, background service, reverse geocoder, or routing request.
 * GPS_PROVIDER / browser geolocation can obtain a fix without internet access.
 */
export async function queueTripBoundaryEventLocation(entityType, entityId, eventType, eventAt = null) {
  if (!Capacitor.isNativePlatform() || !entityType || !entityId || !eventType) return false
  try {
    await NativeTripBoundaryLocation.queueEventLocationCapture({ entityType, entityId, eventType, eventAt })
    return true
  } catch (_) {
    return false
  }
}

export async function captureTripBoundaryLocation() {
  // Android capture has one authoritative path: the durable native event queue.
  // This one-shot fallback is only for browser PWA environments.
  if (Capacitor.isNativePlatform()) return null
  try {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null
    return await new Promise(resolve => navigator.geolocation.getCurrentPosition(
      position => resolve(normalizeTripBoundaryLocation({
        latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracy: position.coords.accuracy, capturedAt: position.timestamp
      })),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    ))
  } catch (_) { return null }
}
