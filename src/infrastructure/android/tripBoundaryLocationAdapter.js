import { Capacitor, registerPlugin } from '@capacitor/core'
import { normalizeTripBoundaryLocation } from '../../application/work/tripBoundaryLocation.js'

const NativeTripBoundaryLocation = registerPlugin('KfeTripBoundaryLocation')

export const TripBoundaryLocationAdapter = Object.freeze({
  async queueEventLocationCapture(entityType, entityId, eventType, eventAt = null) {
    if (!Capacitor.isNativePlatform() || !entityType || !entityId || !eventType) return false
    try {
      await NativeTripBoundaryLocation.queueEventLocationCapture({ entityType, entityId, eventType, eventAt })
      return true
    } catch (_) {
      return false
    }
  },

  async captureOneShotLocation(eventAt = null) {
    // Android has one authoritative pathway: its durable native event queue.
    // Browser PWA fallback uses one fresh, one-shot location request.
    if (Capacitor.isNativePlatform()) return null
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return null
      return await new Promise(resolve => navigator.geolocation.getCurrentPosition(
        position => {
          const location = normalizeTripBoundaryLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            capturedAt: position.timestamp,
          })
          const eventTime = eventAt == null || eventAt === '' ? null : Date.parse(eventAt)
          resolve(location && (eventTime == null || !Number.isFinite(eventTime) || Date.parse(location.capturedAt) >= eventTime) ? location : null)
        },
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
      ))
    } catch (_) {
      return null
    }
  },
})
