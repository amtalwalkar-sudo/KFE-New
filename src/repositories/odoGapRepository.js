import { initializeActiveStorage } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'

export const ODO_GAP_CATEGORIES = Object.freeze({ DEAD_MILES: 'DEAD_MILES', PERSONAL_TRIPS: 'PERSONAL_TRIPS' })
const VALID_CATEGORIES = new Set(Object.values(ODO_GAP_CATEGORIES))

export const OdoGapRepository = {
  async create(gapData) {
    const db = await initializeActiveStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['odoGaps', 'pending_mutations', 'audit_history'], 'readwrite')
      const gapStore = tx.objectStore('odoGaps'); const mutationStore = tx.objectStore('pending_mutations'); const auditStore = tx.objectStore('audit_history'); const now = new Date().toISOString()
      const gapRecord = { id: gapData.id || generateUUID(), previousOdometer: Number(gapData.previousOdometer) || 0, newOdometer: Number(gapData.newOdometer) || 0, gapDistance: Number(gapData.gapDistance) || 0, reason: gapData.reason || 'UNEXPLAINED_DISCREPANCY', category: gapData.category || null, createdAt: gapData.createdAt || now, updatedAt: now }
      try { gapStore.put(gapRecord); writeMutationAndAudit(mutationStore, auditStore, { entityId: gapRecord.id, entityType: 'ODO_GAP', action: 'CREATE', payload: gapRecord, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => resolve(gapRecord); tx.onerror = () => reject(tx.error || new Error('Atomic odo gap persistence failed.')); tx.onabort = () => reject(tx.error || new Error('Odo gap transaction aborted.'))
    })
  },
  async getAll() { const db = await initializeActiveStorage(); return new Promise((resolve, reject) => { const tx = db.transaction('odoGaps', 'readonly'); const req = tx.objectStore('odoGaps').getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error || new Error('Failed to read odometer gaps.')) }) },
  async classify(id, category) {
    if (!VALID_CATEGORIES.has(category)) throw new Error(`Invalid odometer gap category: ${category}`)
    const db = await initializeActiveStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['odoGaps', 'pending_mutations', 'audit_history'], 'readwrite'); const gapStore = tx.objectStore('odoGaps'); const mutationStore = tx.objectStore('pending_mutations'); const auditStore = tx.objectStore('audit_history'); const req = gapStore.get(id)
      req.onsuccess = () => { const gapRecord = req.result; if (!gapRecord) { reject(new Error(`Odometer gap not found: ${id}`)); try { tx.abort() } catch (_) {}; return }; const updatedRecord = { ...gapRecord, category, updatedAt: new Date().toISOString() }; try { gapStore.put(updatedRecord); writeMutationAndAudit(mutationStore, auditStore, { entityId: updatedRecord.id, entityType: 'ODO_GAP', action: 'UPDATE', payload: updatedRecord, createdAt: updatedRecord.updatedAt }) } catch (error) { reject(error); try { tx.abort() } catch (_) {} } }
      req.onerror = () => reject(req.error || new Error('Failed to read odometer gap.')); tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error || new Error('Atomic odometer gap classification failed.')); tx.onabort = () => reject(tx.error || new Error('Odometer gap classification transaction aborted.'))
    })
  }
}
