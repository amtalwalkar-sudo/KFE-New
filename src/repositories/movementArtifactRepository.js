import { initializeActiveStorage } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'

export const MovementArtifactRepository = {
  async create({ shiftId, generatedAt, segments = [], gpsTracePoints = 0, routing = {} }) {
    const db = await initializeActiveStorage(); const now = new Date().toISOString(); const record = { id: generateUUID(), entityType: 'SHIFT_MOVEMENT_ARTIFACT', entityId: shiftId, shiftId, generatedAt: generatedAt || now, createdAt: now, gpsTracePoints: Number(gpsTracePoints) || 0, routing: routing || {}, segments: Array.isArray(segments) ? segments : [] }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['movement_artifacts', 'pending_mutations', 'audit_history'], 'readwrite'); const store = tx.objectStore('movement_artifacts'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history')
      try { store.put(record); writeMutationAndAudit(mutations, audit, { entityId: record.id, entityType: 'MOVEMENT_ARTIFACT', action: 'CREATE', payload: record, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => resolve(record); tx.onerror = () => reject(tx.error || new Error('Movement artifact persistence failed.')); tx.onabort = () => reject(tx.error || new Error('Movement artifact transaction aborted.'))
    })
  },
  async getForShift(shiftId) { const db = await initializeActiveStorage(); return new Promise((resolve, reject) => { const tx = db.transaction('movement_artifacts', 'readonly'); const request = tx.objectStore('movement_artifacts').index('shiftId').getAll(shiftId); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error || new Error('Failed to read movement artifacts.')) }) }
}
