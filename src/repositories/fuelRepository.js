import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'
import { normalizeFuelInput } from '../domain/canonicalNormalization.js'
import { validateFuelEntry } from '../domain/work/fuel.js'

export const FuelRepository = {
  async create(fuelData) {
    const db = await initializeCanonicalStorage()
    const normalized = normalizeFuelInput(fuelData)
    for (const field of ['odometer', 'pricePerKg', 'amount', 'quantityKg']) if (!Number.isFinite(Number(normalized[field]))) throw new Error(`${field} must be a finite number.`)
    const validation = validateFuelEntry({ odometer: normalized.odometer, pricePerKg: normalized.pricePerKg, amount: normalized.amount, isFullTank: normalized.isFullTank })
    if (!validation.valid) throw new Error(validation.reason)
    if (Math.abs(Number(validation.quantityKg) - Number(normalized.quantityKg)) > 1e-9) throw new Error('FUEL_QUANTITY_MISMATCH')
    const now = new Date().toISOString()
    const fuelRecord = {
      id: normalized.id || generateUUID(), odometer: Number(normalized.odometer), pricePerKg: Number(normalized.pricePerKg), amount: Number(normalized.amount), quantityKg: Number(normalized.quantityKg), isFullTank: normalized.isFullTank !== false,
      latitude: normalized.latitude ?? null, longitude: normalized.longitude ?? null, accuracy: normalized.accuracy ?? null, provenance: normalized.provenance ?? null, capturedAt: normalized.capturedAt || now, createdAt: normalized.createdAt || now, updatedAt: now
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['fuel_logs', 'pending_mutations', 'audit_history'], 'readwrite'); const fuelStore = tx.objectStore('fuel_logs'); const mutationStore = tx.objectStore('pending_mutations'); const auditStore = tx.objectStore('audit_history')
      try { fuelStore.put(fuelRecord); writeMutationAndAudit(mutationStore, auditStore, { entityId: fuelRecord.id, entityType: 'FUEL', action: 'CREATE', payload: fuelRecord, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['fuel_logs'], reason: 'fuel:CREATE' }); resolve(fuelRecord) }; tx.onerror = () => reject(tx.error || new Error('Atomic fuel log persistence failed.')); tx.onabort = () => reject(tx.error || new Error('Fuel log transaction aborted.'))
    })
  },
  async getAll() { const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => { const tx = db.transaction('fuel_logs', 'readonly'); const req = tx.objectStore('fuel_logs').getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error || new Error('Failed to read fuel logs.')) }) }
}
