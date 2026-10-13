import { LocationRepository } from '../../repositories/locationRepository.js'

const getNativeGps = async () => { const { registerPlugin } = await import('@capacitor/core'); return registerPlugin('KfeNativeGps') }

const isAndroid = async () => {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.getPlatform() === 'android'
  } catch (_) { return false }
}

export const nativeGpsTraceDedupeKey = point => [point?.eventType || 'PASSENGER_RIDE_TRACE', point?.capturedAt, point?.latitude, point?.longitude].join('|')

export const NativeGpsService = {
  async getPermissionStatus() {
    if (!(await isAndroid())) return { supported: false, locationAllowed: false, backgroundLocationAllowed: false }
    try { const NativeGps = await getNativeGps(); return await NativeGps.getPermissionStatus() }
    catch (error) { return { supported: true, locationAllowed: false, backgroundLocationAllowed: false, error: error?.message || String(error) } }
  },
  async openAppSettings() {
    if (!(await isAndroid())) return false
    try { const NativeGps = await getNativeGps(); await NativeGps.openAppSettings(); return true }
    catch (error) { console.warn('Unable to open Android app settings.', error); return false }
  },
  async start(tripId, eventType = "PASSENGER_RIDE_TRACE", entityType = "TRIP") {
    if (!(await isAndroid()) || !tripId) return false
    try {
      const NativeGps = await getNativeGps()
      await NativeGps.start({ tripId, eventType, entityType })
      return true
    } catch (error) {
      console.warn('Native Android ride GPS unavailable; browser GPS remains active.', error)
      return false
    }
  },
  async stop(tripId) {
    if (!(await isAndroid()) || !tripId) return true
    const NativeGps = await getNativeGps()
    await NativeGps.stop({ tripId })
    return true
  },
  async listTraceOwners() {
    if (!(await isAndroid())) return []
    try {
      const NativeGps = await getNativeGps()
      const result = await NativeGps.listTraceOwners()
      return Array.isArray(result?.owners) ? result.owners.filter(id => typeof id === 'string' && id.trim()) : []
    } catch (error) {
      console.warn('Native Android GPS trace inventory unavailable.', error)
      throw error
    }
  },
  async readTrace(tripId) {
    if (!(await isAndroid()) || !tripId) return []
    try {
      const NativeGps = await getNativeGps()
      const result = await NativeGps.getTrace({ tripId })
      return Array.isArray(result?.points) ? result.points : []
    } catch (error) {
      console.warn('Native Android GPS trace read failed.', error)
      throw error
    }
  },
  async syncTrace(tripId, { entityType = 'TRIP', clearAfterImport = false } = {}) {
    if (!['TRIP', 'SHIFT'].includes(entityType)) throw new Error('Native GPS trace owner must be TRIP or SHIFT.')
    const points = await this.readTrace(tripId)
    if (!points.length) return { imported: 0, points: [], persisted: true }

    const existing = await LocationRepository.forEntity(entityType, tripId)
    const existingKeys = new Set(existing.map(nativeGpsTraceDedupeKey))
    let imported = 0
    let alreadyPresent = 0
    const ordered = [...points].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    for (const point of ordered) {
      const latitude = Number(point.latitude)
      const longitude = Number(point.longitude)
      const capturedTime = new Date(point.capturedAt).getTime()
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
          !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
          !Number.isFinite(capturedTime)) {
        throw new Error('NATIVE_GPS_TRACE_CONTAINS_INVALID_POINT; raw evidence retained.')
      }
      const normalized = {
        eventType: point?.eventType || 'PASSENGER_RIDE_TRACE',
        latitude, longitude,
        accuracy: point.accuracy == null || point.accuracy === '' ? null : Number(point.accuracy),
        speed: point.speed == null || point.speed === '' ? null : Number(point.speed),
        bearing: point.bearing == null || point.bearing === '' ? null : Number(point.bearing),
        capturedAt: new Date(capturedTime).toISOString()
      }
      const key = nativeGpsTraceDedupeKey(normalized)
      if (existingKeys.has(key)) { alreadyPresent += 1; continue }
      await LocationRepository.recordTracePoint({
        entityType,
        entityId: tripId,
        ...normalized
      })
      existingKeys.add(key)
      imported += 1
    }

    // Verify all native evidence is represented by durable canonical records before
    // permitting deletion. If storage fails, this function throws and raw JSONL stays.
    const persisted = await LocationRepository.forEntity(entityType, tripId)
    const persistedKeys = new Set(persisted.map(nativeGpsTraceDedupeKey))
    const missing = ordered.some(point => !persistedKeys.has(nativeGpsTraceDedupeKey({
      eventType: point?.eventType || 'PASSENGER_RIDE_TRACE',
      capturedAt: new Date(point.capturedAt).toISOString(),
      latitude: Number(point.latitude),
      longitude: Number(point.longitude)
    })))
    if (missing) throw new Error('NATIVE_GPS_TRACE_IMPORT_VERIFICATION_FAILED; raw evidence retained.')

    if (clearAfterImport) {
      const NativeGps = await getNativeGps()
      await NativeGps.clearTrace({ tripId })
    }
    return { imported, alreadyPresent, points: ordered, persisted: true }
  }
}
