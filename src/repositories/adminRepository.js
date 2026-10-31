import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'

const ACTIVE_ADMIN_FORM_KEYS = new Set(['businessSetup','vehicle','driver','compliance','maintenance','loan'])
// Legacy stores remain mapped for read-only relationship checks and backup compatibility.
const FORM_STORE = Object.freeze({ businessSetup: 'settings', vehicle: 'vehicles', driver: 'drivers', compliance: 'compliance_records', maintenance: 'maintenance_records', loan: 'loans' })
const isSettingsForm = key => key === 'businessSetup'
const isDeleted = record => record?.deletedAt || record?.deleted === true
function storeFor(formKey) { const store = FORM_STORE[formKey]; if (!store) throw new Error(`No canonical store is defined for Admin form: ${formKey}`); return store }
function toStoredRecord(formKey, values, existing = null) {
  const now = new Date().toISOString()
  const id = existing?.id || generateUUID()
  const base = { ...(existing || {}), id, createdAt: existing?.createdAt || now, updatedAt: now }
  if (isSettingsForm(formKey)) return { ...base, settingKey: formKey, values: { ...(existing?.values || {}), ...structuredClone(values) } }
  return { ...base, ...structuredClone(values) }
}
const readAll = async storeName => { const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error || new Error(`Failed to read ${storeName}.`)) }) }
const readOne = async (storeName, id) => { const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error(`Failed to read ${storeName}.`)) }) }
function toFormRecord(formKey, record) {
  if (!record) return null
  if (isSettingsForm(formKey)) return { id: record.id, values: structuredClone(record.values || {}), createdAt: record.createdAt, updatedAt: record.updatedAt }
  const { id, createdAt, updatedAt, deletedAt, deleted, ...values } = record
  if (formKey === 'loan') {
    const { annualInterestRate, emi, ...source } = values
    return { id, values: structuredClone(source), createdAt, updatedAt, ...(deletedAt ? { deletedAt } : {}), ...(deleted ? { deleted } : {}) }
  }
  return { id, values: structuredClone(values), createdAt, updatedAt, ...(deletedAt ? { deletedAt } : {}), ...(deleted ? { deleted } : {}) }
}
const relationshipStore = Object.freeze({
  driver: [['vehicleId', 'vehicles']],
  compliance: [['vehicleId', 'vehicles']],
  maintenance: [['vehicleId', 'vehicles']],
})
const dependentRecordStores = Object.freeze({
  vehicle: [
    { store: 'drivers', field: 'vehicleId', label: 'driver' },
    { store: 'compliance_records', field: 'vehicleId', label: 'compliance' },
    { store: 'maintenance_records', field: 'vehicleId', label: 'maintenance' },
  ],
})
export const AdminRepository = {
  async list(formKey) { if (!ACTIVE_ADMIN_FORM_KEYS.has(formKey)) throw new Error(`Admin form '${formKey}' is retired and read-only.`); const records = await readAll(storeFor(formKey)); return records.filter(record => !isDeleted(record) && (!isSettingsForm(formKey) || record.settingKey === formKey)).map(record => toFormRecord(formKey, record)).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))) },
  async get(formKey, id) { if (!ACTIVE_ADMIN_FORM_KEYS.has(formKey)) throw new Error(`Admin form '${formKey}' is retired and read-only.`); return toFormRecord(formKey, await readOne(storeFor(formKey), id)) },
  async save(formKey, values, existingId = null) {
    if (!ACTIVE_ADMIN_FORM_KEYS.has(formKey)) throw new Error(`Admin form '${formKey}' is retired and read-only.`)
    const db = await initializeCanonicalStorage(); const storeName = storeFor(formKey); const existingRaw = existingId ? await readOne(storeName, existingId) : null; const existing = existingRaw ? toFormRecord(formKey, existingRaw) : null
    const persistedInputValues = formKey === 'loan' ? { ...values, principal: Number(values.principal), tenureMonths: Number(values.tenureMonths), annualInterestRatePercent: Number(values.annualInterestRatePercent), status: values.status || 'Active' } : values
    // Vehicle expiry is no longer an editable vehicle fact because dated compliance records own renewal validity.
    // Preserve a legacy value on unrelated edits so removing the old field never silently destroys stored history.
    const persistedValues = formKey === 'vehicle' && existingRaw?.expiryDate && !persistedInputValues.expiryDate
      ? { ...persistedInputValues, expiryDate: existingRaw.expiryDate }
      : persistedInputValues
    const record = toStoredRecord(formKey, persistedValues, existingRaw)
    const now = record.updatedAt; const action = existing ? 'UPDATE' : 'CREATE'
    return new Promise((resolve, reject) => {
      const stores = new Set([storeName, 'pending_mutations', 'audit_history'])
      const relationChecks = []
      for (const [field, relatedStore] of relationshipStore[formKey] || []) {
        if (relatedStore && values[field]) {
          stores.add(relatedStore)
          relationChecks.push({ kind: 'parent', field, store: relatedStore, id: values[field] })
        }
      }
      const tx = db.transaction([...stores], 'readwrite')
      let remaining = relationChecks.length + (existingId ? 1 : 0)
      let settled = false
      let currentRecord = null
      const parentRecords = new Map()
      const fail = error => {
        if (settled) return
        settled = true
        try { tx.abort() } catch (_) {}
        reject(error)
      }
      const commit = () => {
        if (remaining > 0 || settled) return
        try {
          if (existingId) {
            if (!currentRecord || isDeleted(currentRecord)) throw new Error(`Cannot update missing or deleted ${formKey} record.`)
            if (String(currentRecord.updatedAt || '') !== String(existingRaw?.updatedAt || '')) throw new Error(`This ${formKey} record changed after the form was opened. Reload it before saving to avoid overwriting newer data.`)
          }
          for (const check of relationChecks) {
            const parent = parentRecords.get(check.field)
            if (!parent || isDeleted(parent)) throw new Error(`${check.field} references a missing or deleted canonical record.`)
          }
          tx.objectStore(storeName).put(record)
          writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: record.id, entityType: formKey, action, payload: record, createdAt: now })
        } catch (error) { fail(error) }
      }
      if (existingId) {
        const request = tx.objectStore(storeName).get(existingId)
        request.onsuccess = () => { currentRecord = request.result; remaining--; commit() }
        request.onerror = () => fail(request.error || new Error(`Failed to verify existing ${formKey} record.`))
      }
      for (const check of relationChecks) {
        const request = tx.objectStore(check.store).get(check.id)
        request.onsuccess = () => { parentRecords.set(check.field, request.result); remaining--; commit() }
        request.onerror = () => fail(request.error || new Error(`Failed to verify ${check.field} relationship.`))
      }
      commit()
      tx.oncomplete = () => {
        if (settled) return
        settled = true
        notifyCanonicalDataChanged({ stores: [storeName], reason: `admin:${action}` })
        resolve(toFormRecord(formKey, record))
      }
      tx.onerror = () => fail(tx.error || new Error(`Failed to save ${formKey}.`))
      tx.onabort = () => fail(tx.error || new Error(`Save ${formKey} aborted.`))
    })
  },
  async remove(formKey, id) {
    if (!ACTIVE_ADMIN_FORM_KEYS.has(formKey)) throw new Error(`Admin form '${formKey}' is retired and read-only.`)
    if (!id) throw new Error('Admin record id is required.')
    const db = await initializeCanonicalStorage()
    const storeName = storeFor(formKey)
    const now = new Date().toISOString()
    return new Promise((resolve, reject) => {
      const dependencies = dependentRecordStores[formKey] || []
      const stores = new Set([storeName, 'pending_mutations', 'audit_history', ...dependencies.map(item => item.store)])
      const tx = db.transaction([...stores], 'readwrite')
      const store = tx.objectStore(storeName)
      let settled = false
      let remaining = dependencies.length + 1
      let record = null
      const dependentRows = new Map()
      const fail = error => { if (settled) return; settled = true; try { tx.abort() } catch (_) {}; reject(error) }
      const commit = () => {
        if (settled || remaining > 0) return
        if (!record || isDeleted(record)) { fail(new Error(`Cannot delete missing or deleted ${formKey} record.`)); return }
        for (const dependency of dependencies) {
          const linked = dependentRows.get(dependency.store) || []
          if (linked.some(item => !isDeleted(item) && item[dependency.field] === id)) {
            fail(new Error(`Cannot delete this ${formKey}: linked ${dependency.label} records still reference it.`))
            return
          }
        }
        try {
          record.deletedAt = now
          record.updatedAt = now
          record.deleted = true
          store.put(record)
          writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: id, entityType: formKey, action: 'DELETE', payload: { id, formKey, deletedAt: now }, createdAt: now })
        } catch (error) { fail(error) }
      }
      const request = store.get(id)
      request.onsuccess = () => { record = request.result; remaining--; commit() }
      request.onerror = () => fail(request.error || new Error(`Failed to read ${formKey} for deletion.`))
      for (const dependency of dependencies) {
        const childRequest = tx.objectStore(dependency.store).getAll()
        childRequest.onsuccess = () => { dependentRows.set(dependency.store, childRequest.result || []); remaining--; commit() }
        childRequest.onerror = () => fail(childRequest.error || new Error(`Failed to verify linked ${dependency.label} records.`))
      }
      tx.oncomplete = () => { if (settled) return; settled = true; notifyCanonicalDataChanged({ stores: [storeName], reason: 'admin:DELETE' }); resolve(true) }
      tx.onerror = () => fail(tx.error || new Error(`Failed to delete ${formKey}.`))
      tx.onabort = () => fail(tx.error || new Error(`Delete ${formKey} aborted.`))
    })
  },
}
export const CANONICAL_ADMIN_STORE_MAP = FORM_STORE
