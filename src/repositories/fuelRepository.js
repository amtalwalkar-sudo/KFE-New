import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'
import { normalizeFuelInput } from '../domain/canonicalNormalization.js'
import { validateFuelEntry } from '../domain/work/fuel.js'

const stores = ['fuel_logs', 'pending_mutations', 'audit_history']
const validateNormalizedFuel = normalized => {
  for (const field of ['odometer', 'pricePerKg', 'amount', 'quantityKg']) if (!Number.isFinite(Number(normalized[field]))) throw new Error(`${field} must be a finite number.`)
  const validation = validateFuelEntry({ odometer: normalized.odometer, pricePerKg: normalized.pricePerKg, amount: normalized.amount, isFullTank: normalized.isFullTank })
  if (!validation.valid) throw new Error(validation.reason)
  if (Math.abs(Number(validation.quantityKg) - Number(normalized.quantityKg)) > 1e-9) throw new Error('FUEL_QUANTITY_MISMATCH')
}
const isDeleted = record => record?.deletedAt || record?.deleted === true

export const FuelRepository = {
  async create(fuelData) {
    const db = await initializeCanonicalStorage()
    const normalized = normalizeFuelInput(fuelData)
    validateNormalizedFuel(normalized)
    const now = new Date().toISOString()
    const fuelRecord = {
      id: normalized.id || generateUUID(), odometer: Number(normalized.odometer), pricePerKg: Number(normalized.pricePerKg), amount: Number(normalized.amount), quantityKg: Number(normalized.quantityKg), isFullTank: normalized.isFullTank !== false,
      latitude: normalized.latitude ?? null, longitude: normalized.longitude ?? null, accuracy: normalized.accuracy ?? null, provenance: normalized.provenance ?? null, capturedAt: normalized.capturedAt || now, createdAt: normalized.createdAt || now, updatedAt: now
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite'); const fuelStore = tx.objectStore('fuel_logs'); const mutationStore = tx.objectStore('pending_mutations'); const auditStore = tx.objectStore('audit_history')
      try { fuelStore.put(fuelRecord); writeMutationAndAudit(mutationStore, auditStore, { entityId: fuelRecord.id, entityType: 'FUEL', action: 'CREATE', payload: fuelRecord, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['fuel_logs'], reason: 'fuel:CREATE' }); resolve(fuelRecord) }; tx.onerror = () => reject(tx.error || new Error('Atomic fuel log persistence failed.')); tx.onabort = () => reject(tx.error || new Error('Fuel log transaction aborted.'))
    })
  },
  async update(id, fuelData) {
    const db = await initializeCanonicalStorage()
    const existing = await new Promise((resolve, reject) => {
      const request = db.transaction('fuel_logs', 'readonly').objectStore('fuel_logs').get(id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error || new Error('Failed to read fuel log.'))
    })
    if (!existing || isDeleted(existing)) throw new Error('Cannot update missing fuel log.')
    const normalized = normalizeFuelInput({ ...existing, ...fuelData, id: existing.id, createdAt: existing.createdAt, capturedAt: existing.capturedAt })
    validateNormalizedFuel(normalized)
    const now = new Date().toISOString()
    const fuelRecord = {
      ...existing,
      odometer: Number(normalized.odometer), pricePerKg: Number(normalized.pricePerKg), amount: Number(normalized.amount), quantityKg: Number(normalized.quantityKg), isFullTank: normalized.isFullTank !== false,
      updatedAt: now
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite'); const fuelStore = tx.objectStore('fuel_logs'); const mutationStore = tx.objectStore('pending_mutations'); const auditStore = tx.objectStore('audit_history')
      try { fuelStore.put(fuelRecord); writeMutationAndAudit(mutationStore, auditStore, { entityId: fuelRecord.id, entityType: 'FUEL', action: 'UPDATE', payload: fuelRecord, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['fuel_logs'], reason: 'fuel:UPDATE' }); resolve(fuelRecord) }; tx.onerror = () => reject(tx.error || new Error('Atomic fuel log update failed.')); tx.onabort = () => reject(tx.error || new Error('Fuel log update transaction aborted.'))
    })
  },
  async remove(id) {
    const db = await initializeCanonicalStorage()
    const now = new Date().toISOString()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite'); const fuelStore = tx.objectStore('fuel_logs'); const mutationStore = tx.objectStore('pending_mutations'); const auditStore = tx.objectStore('audit_history'); const request = fuelStore.get(id)
      request.onsuccess = () => {
        const record = request.result
        if (!record || isDeleted(record)) { try { tx.abort() } catch (_) {}; reject(new Error('Cannot delete missing fuel log.')); return }
        record.deletedAt = now; record.deleted = true; record.updatedAt = now
        try { fuelStore.put(record); writeMutationAndAudit(mutationStore, auditStore, { entityId: id, entityType: 'FUEL', action: 'DELETE', payload: { id, deletedAt: now }, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error) }
      }
      request.onerror = () => { try { tx.abort() } catch (_) {}; reject(request.error || new Error('Failed to read fuel log for deletion.')) }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['fuel_logs'], reason: 'fuel:DELETE' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Atomic fuel log deletion failed.')); tx.onabort = () => reject(tx.error || new Error('Fuel log deletion transaction aborted.'))
    })
  },
  async getAll() {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('fuel_logs', 'readonly'); const req = tx.objectStore('fuel_logs').getAll()
      req.onsuccess = () => resolve((req.result || []).filter(record => !isDeleted(record)).sort((a, b) => String(b.capturedAt || b.createdAt || '').localeCompare(String(a.capturedAt || a.createdAt || ''))))
      req.onerror = () => reject(req.error || new Error('Failed to read fuel logs.'))
    })
  }
}
