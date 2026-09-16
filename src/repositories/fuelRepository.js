import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'

export const FuelRepository = {
  async create(fuelData) {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['fuel_logs', 'pending_mutations', 'audit_history'], 'readwrite')
      const fuelStore = tx.objectStore('fuel_logs')
      const mutationStore = tx.objectStore('pending_mutations')
      const auditStore = tx.objectStore('audit_history')
      const now = new Date().toISOString()
      const fuelRecord = {
        id: fuelData.id || generateUUID(), odometer: Number(fuelData.odometer), pricePerKg: Number(fuelData.pricePerKg), amount: Number(fuelData.amount), quantityKg: Number(fuelData.quantityKg), isFullTank: fuelData.isFullTank !== false,
        latitude: fuelData.latitude ?? null, longitude: fuelData.longitude ?? null, accuracy: fuelData.accuracy ?? null, capturedAt: fuelData.capturedAt || now, createdAt: fuelData.createdAt || now, updatedAt: now
      }
      try { fuelStore.put(fuelRecord); writeMutationAndAudit(mutationStore, auditStore, { entityId: fuelRecord.id, entityType: 'FUEL', action: 'CREATE', payload: fuelRecord, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['fuel_logs'], reason: 'fuel:CREATE' }); resolve(fuelRecord) }
      tx.onerror = () => reject(tx.error || new Error('Atomic fuel log persistence failed.'))
      tx.onabort = () => reject(tx.error || new Error('Fuel log transaction aborted.'))
    })
  },
  async getAll() {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => { const tx = db.transaction('fuel_logs', 'readonly'); const req = tx.objectStore('fuel_logs').getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error || new Error('Failed to read fuel logs.')) })
  }
}
