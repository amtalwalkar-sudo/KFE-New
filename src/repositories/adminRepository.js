import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'
import { getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'
import { validateAdminForm } from '../application/admin/universalFormRules.js'

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
const relationshipStore = Object.freeze({ driver: [['vehicleId', 'vehicles']], compliance: [['vehicleId', 'vehicles']], maintenance: [['vehicleId', 'vehicles']] })
async function validateRelationships(db, formKey, values) {
  for (const [field, storeName] of relationshipStore[formKey] || []) {
    const id = values[field]
    if (!id) continue
    const record = await new Promise((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    if (!record || isDeleted(record)) throw new Error(`${field} references a missing or deleted canonical record.`)
  }
}
export const AdminRepository = {
  async getSetting(id) { return toFormRecord('businessSetup', await readOne('settings', id)) },
  async saveSetting(id, settingKey, values) {
    const now = new Date().toISOString()
    const record = { id, settingKey, values: structuredClone(values), createdAt: now, updatedAt: now }
    const db = await initializeCanonicalStorage()
    await new Promise((resolve, reject) => { const tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put(record); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error('Failed to save setting.')); tx.onabort = () => reject(tx.error || new Error('Save setting transaction aborted.')) })
    return structuredClone(values)
  },
  async list(formKey) { if (!ACTIVE_ADMIN_FORM_KEYS.has(formKey)) throw new Error(`Admin form '${formKey}' is retired and read-only.`); const records = await readAll(storeFor(formKey)); return records.filter(record => !isDeleted(record) && (!isSettingsForm(formKey) || record.settingKey === formKey)).map(record => toFormRecord(formKey, record)).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))) },
  async get(formKey, id) { if (!ACTIVE_ADMIN_FORM_KEYS.has(formKey)) throw new Error(`Admin form '${formKey}' is retired and read-only.`); return toFormRecord(formKey, await readOne(storeFor(formKey), id)) },
  async save(formKey, values, existingId = null) {
    if (!ACTIVE_ADMIN_FORM_KEYS.has(formKey)) throw new Error(`Admin form '${formKey}' is retired and read-only.`)
    const definition = getAdminFormDefinition(formKey)
    if (definition) { const validation = validateAdminForm(definition, values); if (!validation.valid) throw new Error(`Invalid ${formKey}: ${Object.values(validation.errors).join(' ')}`); values = validation.values }
    const db = await initializeCanonicalStorage(); const storeName = storeFor(formKey); const existingRaw = existingId ? await readOne(storeName, existingId) : null; const existing = existingRaw ? toFormRecord(formKey, existingRaw) : null
    await validateRelationships(db, formKey, values)
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
      const tx = db.transaction([storeName, 'pending_mutations', 'audit_history'], 'readwrite')
      const store = tx.objectStore(storeName)
      let settled = false
      const fail = error => { if (settled) return; settled = true; try { tx.abort() } catch (_) {}; reject(error) }
      const request = store.get(id)
      request.onsuccess = () => {
        const record = request.result
        if (!record || isDeleted(record)) { fail(new Error(`Cannot delete missing or deleted ${formKey} record.`)); return }
        try {
          record.deletedAt = now
          record.updatedAt = now
          record.deleted = true
          store.put(record)
          writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: id, entityType: formKey, action: 'DELETE', payload: { id, formKey, deletedAt: now }, createdAt: now })
        } catch (error) { fail(error) }
      }
      request.onerror = () => fail(request.error || new Error(`Failed to read ${formKey} for deletion.`))
      tx.oncomplete = () => { if (settled) return; settled = true; notifyCanonicalDataChanged({ stores: [storeName], reason: 'admin:DELETE' }); resolve(true) }
      tx.onerror = () => fail(tx.error || new Error(`Failed to delete ${formKey}.`))
      tx.onabort = () => fail(tx.error || new Error(`Delete ${formKey} aborted.`))
    })
  },
}
export const CANONICAL_ADMIN_STORE_MAP = FORM_STORE
