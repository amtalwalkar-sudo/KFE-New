import { Capacitor, NativePlugins } from '../capacitor/nativePluginRegistry.js'
import { normalizeTripBoundaryLocation } from '../../domain/location/tripBoundaryLocation.js'

const NativeTripBoundaryLocation = NativePlugins.tripBoundaryLocation

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
    if (Capacitor.isNativePlatform()) return null
    try {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return null
      const eventTime = eventAt == null || eventAt === '' ? NaN : Date.parse(eventAt)
      if (!Number.isFinite(eventTime) || eventTime <= 0) return null
      const startedAt = Date.now()
      for (const targetElapsed of [0, 3000, 7000, 12000, 20000, 27000]) {
        const waitMs = Math.max(0, targetElapsed - (Date.now() - startedAt))
        if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs))
        const remaining = 30000 - (Date.now() - startedAt)
        if (remaining <= 0) break
        const location = await new Promise(resolve => navigator.geolocation.getCurrentPosition(
          position => {
            const normalized = normalizeTripBoundaryLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              capturedAt: position.timestamp,
            })
            const hasAccuracy = normalized?.accuracy !== null && normalized?.accuracy !== undefined && normalized?.accuracy !== ''
            const accuracy = hasAccuracy ? Number(normalized.accuracy) : NaN
            const accuracyValid = !hasAccuracy || (Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 75)
            resolve(normalized && accuracyValid && Date.parse(normalized.capturedAt) >= eventTime ? normalized : null)
          },
          () => resolve(null),
          { enableHighAccuracy: true, maximumAge: 0, timeout: Math.min(2500, remaining) },
        ))
        if (location) return location
      }
      return null
    } catch (_) {
      return null
    }
  },
})
