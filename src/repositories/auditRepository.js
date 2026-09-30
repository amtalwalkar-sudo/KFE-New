import { initializeCanonicalStorage } from '../utils/indexedDB.js'

const read = requestFactory => new Promise((resolve, reject) => {
  const request = requestFactory()
  request.onsuccess = () => resolve(request.result || [])
  request.onerror = () => reject(request.error || new Error('Audit history query failed.'))
})

export const AuditRepository = Object.freeze({
  async getAll() {
    const db = await initializeCanonicalStorage()
    return read(() => db.transaction('audit_history', 'readonly').objectStore('audit_history').getAll())
  },
  async forEntity(entityType, entityId) {
    const db = await initializeCanonicalStorage()
    const records = await read(() => db.transaction('audit_history', 'readonly').objectStore('audit_history').index('entityId').getAll(entityId))
    return records.filter(record => record.entityType === entityType).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  }
})
