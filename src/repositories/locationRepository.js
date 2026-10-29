import { initializeCanonicalStorage } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'
import { notifyCanonicalDataChanged } from '../utils/indexedDB.js'

export const normalizeNullableGpsNumber = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null

export const LocationRepository = {
  async record({ id = null, entityType, entityId, eventType, eventAt = null, latitude, longitude, accuracy = null, capturedAt }) {
    const fixTimestamp = capturedAt == null || capturedAt === '' ? NaN : Date.parse(capturedAt)
    if (!Number.isFinite(fixTimestamp) || fixTimestamp <= 0) throw new TypeError('GPS snapshot requires the location provider fix timestamp; event wall-clock time is not a substitute.')
    const db = await initializeCanonicalStorage(); const now = new Date().toISOString(); const record = { id: id || generateUUID(), entityType, entityId, eventType, latitude: Number(latitude), longitude: Number(longitude), accuracy: normalizeNullableGpsNumber(accuracy), eventAt: eventAt == null || eventAt === '' ? null : Number.isFinite(Date.parse(eventAt)) ? new Date(eventAt).toISOString() : null, capturedAt: new Date(fixTimestamp).toISOString(), createdAt: now }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['gps_snapshots', 'pending_mutations', 'audit_history'], 'readwrite')
      try { tx.objectStore('gps_snapshots').put(record); writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: record.id, entityType: 'GPS_SNAPSHOT', action: 'CREATE', payload: record, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['gps_snapshots'], reason: 'gps-snapshot-created' }); resolve(record) }; tx.onerror = () => reject(tx.error || new Error('GPS snapshot persistence failed.')); tx.onabort = () => reject(tx.error || new Error('GPS snapshot persistence aborted.'))
    })
  },
  async all() {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('gps_snapshots', 'readonly')
      const request = tx.objectStore('gps_snapshots').getAll()
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt)))
      request.onerror = () => reject(request.error || new Error('GPS snapshot listing failed.'))
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
