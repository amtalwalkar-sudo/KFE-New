import { initializeCanonicalStorage } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'
import { notifyCanonicalDataChanged } from '../utils/indexedDB.js'

export const normalizeNullableGpsNumber = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null

export const LocationRepository = {
  async record({ id = null, entityType, entityId, eventType, eventAt = null, latitude, longitude, accuracy = null, capturedAt, placeName = null }) {
    const fixTimestamp = capturedAt == null || capturedAt === '' ? NaN : Date.parse(capturedAt)
    if (!Number.isFinite(fixTimestamp) || fixTimestamp <= 0) throw new TypeError('GPS snapshot requires the location provider fix timestamp; event wall-clock time is not a substitute.')
    const db = await initializeCanonicalStorage(); const now = new Date().toISOString(); const record = { id: id || generateUUID(), entityType, entityId, eventType, latitude: Number(latitude), longitude: Number(longitude), accuracy: normalizeNullableGpsNumber(accuracy), placeName: placeName || null, eventAt: eventAt == null || eventAt === '' ? null : Number.isFinite(Date.parse(eventAt)) ? new Date(eventAt).toISOString() : null, capturedAt: new Date(fixTimestamp).toISOString(), createdAt: now }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['gps_snapshots', 'pending_mutations', 'audit_history'], 'readwrite')
      try { tx.objectStore('gps_snapshots').put(record); writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: record.id, entityType: 'GPS_SNAPSHOT', action: 'CREATE', payload: record, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['gps_snapshots'], reason: 'gps-snapshot-created' }); resolve(record) }; tx.onerror = () => reject(tx.error || new Error('GPS snapshot persistence failed.')); tx.onabort = () => reject(tx.error || new Error('GPS snapshot persistence aborted.'))
    })
  },
  async updatePlaceName(id, placeName) {
    if (!id || !placeName) return false
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['gps_snapshots', 'pending_mutations', 'audit_history'], 'readwrite')
      const snapshots = tx.objectStore('gps_snapshots'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history')
      const request = snapshots.get(id)
      request.onsuccess = () => {
        const record = request.result
        if (!record) { try { tx.abort() } catch (_) {}; resolve(false); return }
        record.placeName = String(placeName).trim() || null
        record.updatedAt = new Date().toISOString()
        snapshots.put(record)
        writeMutationAndAudit(mutations, audit, { entityId: record.id, entityType: 'GPS_SNAPSHOT', action: 'UPDATE', payload: record, createdAt: record.updatedAt })
      }
      request.onerror = () => reject(request.error || new Error('GPS snapshot lookup failed.'))
      tx.oncomplete = () => {
        notifyCanonicalDataChanged({ stores: ['gps_snapshots', 'trips'], reason: 'gps-place-name-enriched' })
        resolve(true)
      }
      tx.onerror = () => reject(tx.error || new Error('GPS place-name update failed.'))
      tx.onabort = () => { if (tx.error) reject(tx.error) }
    })
  },
  async recordTracePoint({ entityType, entityId, eventType = 'MOVEMENT_TRACE', latitude, longitude, accuracy = null, speed = null, bearing = null, capturedAt }) {
    const db = await initializeCanonicalStorage()
    const now = new Date().toISOString()
    const record = {
      id: generateUUID(), entityType, entityId, eventType,
      latitude: Number(latitude), longitude: Number(longitude),
      accuracy: normalizeNullableGpsNumber(accuracy),
      speed: normalizeNullableGpsNumber(speed),
      bearing: normalizeNullableGpsNumber(bearing),
      placeName: null, capturedAt: capturedAt || now, createdAt: now
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('gps_snapshots', 'readwrite')
      tx.objectStore('gps_snapshots').put(record)
      tx.oncomplete = () => resolve(record)
      tx.onerror = () => reject(tx.error || new Error('GPS trace persistence failed.'))
      tx.onabort = () => reject(tx.error || new Error('GPS trace persistence aborted.'))
    })
  },
  async getById(id) {
    if (!id) return null
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('gps_snapshots', 'readonly')
      const request = tx.objectStore('gps_snapshots').get(id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error || new Error('GPS snapshot lookup failed.'))
    })
  },
  async forEntity(entityType, entityId) { const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => { const tx = db.transaction('gps_snapshots', 'readonly'); const request = tx.objectStore('gps_snapshots').index('entityId').getAll(entityId); request.onsuccess = () => resolve((request.result || []).filter(item => item.entityType === entityType).sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))); request.onerror = () => reject(request.error || new Error('GPS snapshot query failed.')) }) }
}
