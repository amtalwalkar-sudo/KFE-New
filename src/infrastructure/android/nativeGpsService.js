import { LocationRepository } from '../repositories/locationRepository.js'

const getNativeGps = async () => { const { registerPlugin } = await import('@capacitor/core'); return registerPlugin('KfeNativeGps') }

const isAndroid = async () => {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.getPlatform() === 'android'
  } catch (_) { return false }
}

const dedupeKey = point => [point?.capturedAt, point?.latitude, point?.longitude].join('|')

export const NativeGpsService = {
  async start(tripId) {
    if (!(await isAndroid()) || !tripId) return false
    try {
      const NativeGps = await getNativeGps()
      await NativeGps.start({ tripId })
      return true
    } catch (error) {
      console.warn('Native Android ride GPS unavailable; browser GPS remains active.', error)
      return false
    }
  },
  async stop(tripId) {
    if (!(await isAndroid()) || !tripId) return
    try { const NativeGps = await getNativeGps(); await NativeGps.stop({ tripId }) } catch (error) { console.warn('Native Android GPS stop failed.', error) }
  },
  async readTrace(tripId) {
    if (!(await isAndroid()) || !tripId) return []
    try {
      const NativeGps = await getNativeGps()
      const result = await NativeGps.getTrace({ tripId })
      return Array.isArray(result?.points) ? result.points : []
    } catch (error) {
      console.warn('Native Android GPS trace read failed.', error)
      return []
    }
  },
  async syncTrace(tripId) {
    const points = await this.readTrace(tripId)
    if (!points.length) return { imported: 0, points: [] }

    const existing = await LocationRepository.forEntity('TRIP', tripId)
    const existingKeys = new Set(existing.map(dedupeKey))
    let imported = 0
    const ordered = [...points].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    for (const point of ordered) {
      const normalized = {
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        accuracy: Number.isFinite(Number(point.accuracy)) ? Number(point.accuracy) : null,
        speed: Number.isFinite(Number(point.speed)) ? Number(point.speed) : null,
        bearing: Number.isFinite(Number(point.bearing)) ? Number(point.bearing) : null,
        capturedAt: new Date(point.capturedAt).toISOString()
      }
      if (!Number.isFinite(normalized.latitude) || !Number.isFinite(normalized.longitude)) continue
      const key = dedupeKey(normalized)
      if (existingKeys.has(key)) continue
      await LocationRepository.recordTracePoint({
        entityType: 'TRIP',
        entityId: tripId,
        eventType: 'PASSENGER_RIDE_TRACE',
        ...normalized
      })
      existingKeys.add(key)
      imported += 1
    }

    try { const NativeGps = await getNativeGps(); await NativeGps.clearTrace({ tripId }) } catch (_) {}
    return { imported, points: ordered }
  }
}
