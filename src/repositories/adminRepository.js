import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'

const FORM_STORE = Object.freeze({
  vehicle: 'vehicles', driver: 'drivers', compliance: 'compliance_records', maintenance: 'maintenance_records',
  driverCollectedData: 'driver_collected_data', loan: 'loans', loanPayment: 'loan_payments', prepayment: 'prepayments',
  driverTarget: 'driver_targets', breakEvenInputs: 'break_even_inputs', backupRestore: 'settings', themes: 'settings', dataReset: 'settings',
})
const isSettingsForm = key => key === 'backupRestore' || key === 'themes' || key === 'dataReset'
const isDeleted = record => record?.deletedAt || record?.deleted === true
function storeFor(formKey) { const store = FORM_STORE[formKey]; if (!store) throw new Error(`No canonical store is defined for Admin form: ${formKey}`); return store }
function toStoredRecord(formKey, values, existing = null) { const now = new Date().toISOString(); const id = existing?.id || generateUUID(); const base = { id, createdAt: existing?.createdAt || now, updatedAt: now }; if (isSettingsForm(formKey)) return { ...base, settingKey: formKey, values: structuredClone(values) }; return { ...base, ...structuredClone(values) } }
const readAll = async storeName => { const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error || new Error(`Failed to read ${storeName}.`)) }) }
function toFormRecord(formKey, record) { if (!record) return null; if (isSettingsForm(formKey)) return { id: record.id, values: structuredClone(record.values || {}), createdAt: record.createdAt, updatedAt: record.updatedAt }; const { id, createdAt, updatedAt, deletedAt, deleted, ...values } = record; return { id, values: structuredClone(values), createdAt, updatedAt, ...(deletedAt ? { deletedAt } : {}), ...(deleted ? { deleted } : {}) } }

export const AdminRepository = {
  async list(formKey) { const records = await readAll(storeFor(formKey)); return records.filter(record => !isDeleted(record) && (!isSettingsForm(formKey) || record.settingKey === formKey)).map(record => toFormRecord(formKey, record)).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))) },
  async get(formKey, id) { const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => { const request = db.transaction(storeFor(formKey), 'readonly').objectStore(storeFor(formKey)).get(id); request.onsuccess = () => resolve(toFormRecord(formKey, request.result)); request.onerror = () => reject(request.error || new Error(`Failed to read ${formKey}.`)) }) },
  async save(formKey, values, existingId = null) {
    const db = await initializeCanonicalStorage(); const storeName = storeFor(formKey); const existing = existingId ? await this.get(formKey, existingId) : null
    const existingRaw = existing ? { id: existing.id, createdAt: existing.createdAt, updatedAt: existing.updatedAt, deletedAt: existing.deletedAt, deleted: existing.deleted, ...existing.values } : null
    const record = toStoredRecord(formKey, values, existingRaw); const now = record.updatedAt; const action = existing ? 'UPDATE' : 'CREATE'
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName, 'pending_mutations', 'audit_history'], 'readwrite')
      try { tx.objectStore(storeName).put(record); writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: record.id, entityType: formKey, action, payload: record, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: [storeName], reason: `admin:${action}` }); resolve(toFormRecord(formKey, record)) }; tx.onerror = () => reject(tx.error || new Error(`Failed to save ${formKey}.`)); tx.onabort = () => reject(tx.error || new Error(`Save ${formKey} aborted.`))
    })
  },
  async remove(formKey, id) {
    const db = await initializeCanonicalStorage(); const storeName = storeFor(formKey); const now = new Date().toISOString()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName, 'pending_mutations', 'audit_history'], 'readwrite')
      const store = tx.objectStore(storeName); const request = store.get(id)
      request.onsuccess = () => {
        const record = request.result
        if (!record) { try { tx.abort() } catch (_) {}; reject(new Error(`Cannot delete missing ${formKey} record.`)); return }
        record.deletedAt = now; record.updatedAt = now; record.deleted = true
        store.put(record)
        writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: id, entityType: formKey, action: 'DELETE', payload: { id, formKey, deletedAt: now }, createdAt: now })
      }
      request.onerror = () => { try { tx.abort() } catch (_) {}; reject(request.error || new Error(`Failed to read ${formKey} for deletion.`)) }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: [storeName], reason: 'admin:DELETE' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error(`Failed to delete ${formKey}.`)); tx.onabort = () => reject(tx.error || new Error(`Delete ${formKey} aborted.`))
    })
  },
}
export const CANONICAL_ADMIN_STORE_MAP = FORM_STORE
