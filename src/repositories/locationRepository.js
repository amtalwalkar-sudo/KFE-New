import { initializeCanonicalStorage } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'
import { notifyCanonicalDataChanged } from '../utils/indexedDB.js'

export const LocationRepository = {
  async record({ entityType, entityId, eventType, latitude, longitude, accuracy = null, capturedAt, placeName = null }) {
    const db = await initializeCanonicalStorage(); const now = new Date().toISOString(); const record = { id: generateUUID(), entityType, entityId, eventType, latitude: Number(latitude), longitude: Number(longitude), accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null, placeName: placeName || null, capturedAt: capturedAt || now, createdAt: now }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['gps_snapshots', 'pending_mutations', 'audit_history'], 'readwrite')
      try { tx.objectStore('gps_snapshots').put(record); writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: record.id, entityType: 'GPS_SNAPSHOT', action: 'CREATE', payload: record, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => resolve(record); tx.onerror = () => reject(tx.error || new Error('GPS snapshot persistence failed.')); tx.onabort = () => reject(tx.error || new Error('GPS snapshot persistence aborted.'))
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
      accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
      speed: Number.isFinite(Number(speed)) ? Number(speed) : null,
      bearing: Number.isFinite(Number(bearing)) ? Number(bearing) : null,
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
  async forEntity(entityType, entityId) { const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => { const tx = db.transaction('gps_snapshots', 'readonly'); const request = tx.objectStore('gps_snapshots').getAll(); request.onsuccess = () => resolve((request.result || []).filter(item => item.entityType === entityType && item.entityId === entityId).sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))); request.onerror = () => reject(request.error || new Error('GPS snapshot query failed.')) }) }
}
