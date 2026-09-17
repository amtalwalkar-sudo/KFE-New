import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'
import { getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'
import { validateAdminForm } from '../application/admin/universalFormRules.js'
import { deriveLoanPosition, paymentAllocationPreview, calculatePrepaymentEstimate, KFE_LOAN_ANNUAL_RATE_PERCENT, calculateEmi } from '../domain/finance/loanEngine.js'

const FORM_STORE = Object.freeze({ vehicle: 'vehicles', driver: 'drivers', compliance: 'compliance_records', maintenance: 'maintenance_records', driverCollectedData: 'driver_collected_data', shift: 'shifts', loan: 'loans', loanPayment: 'loan_payments', prepayment: 'prepayments', driverTarget: 'driver_targets', breakEvenInputs: 'break_even_inputs', backupRestore: 'settings', themes: 'settings', dataReset: 'settings' })
const isSettingsForm = key => key === 'backupRestore' || key === 'themes' || key === 'dataReset'
const isFinanceForm = key => key === 'loan' || key === 'loanPayment' || key === 'prepayment'
const isDeleted = record => record?.deletedAt || record?.deleted === true
function storeFor(formKey) { const store = FORM_STORE[formKey]; if (!store) throw new Error(`No canonical store is defined for Admin form: ${formKey}`); return store }
function toStoredRecord(formKey, values, existing = null) { const now = new Date().toISOString(); const id = existing?.id || generateUUID(); const base = { id, createdAt: existing?.createdAt || now, updatedAt: now }; if (isSettingsForm(formKey)) return { ...base, settingKey: formKey, values: structuredClone(values) }; return { ...base, ...structuredClone(values) } }
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
  if (formKey === 'loanPayment') {
    const { allocations, allocatedAmount, status, ...source } = values
    return { id, values: { ...structuredClone(source), status: status || 'PAID' }, createdAt, updatedAt, ...(deletedAt ? { deletedAt } : {}), ...(deleted ? { deleted } : {}) }
  }
  if (formKey === 'prepayment') {
    const { outstandingBefore, outstandingAfter, effect, status, ...source } = values
    return { id, values: { ...structuredClone(source), status: status || 'Applied', effect: effect || 'Reduce tenure' }, createdAt, updatedAt, ...(deletedAt ? { deletedAt } : {}), ...(deleted ? { deleted } : {}) }
  }
  return { id, values: structuredClone(values), createdAt, updatedAt, ...(deletedAt ? { deletedAt } : {}), ...(deleted ? { deleted } : {}) }
}
const relationshipStore = Object.freeze({ compliance: [['vehicleId', 'vehicles']], maintenance: [['vehicleId', 'vehicles']], driverCollectedData: [['driverId', 'drivers'], ['vehicleId', 'vehicles']], loanPayment: [['loanId', 'loans']], prepayment: [['loanId', 'loans']], driverTarget: [['driverId', 'drivers']] })
async function validateRelationships(db, formKey, values) {
  for (const [field, storeName] of relationshipStore[formKey] || []) {
    const id = values[field]
    if (!id) continue
    const record = await new Promise((resolve, reject) => { const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    if (!record || isDeleted(record)) throw new Error(`${field} references a missing or deleted canonical record.`)
  }
}

async function prepareFinanceValues(formKey, values, existingId) {
  if (formKey === 'loan') {
    const principal = Number(values.principal)
    const tenureMonths = Number(values.tenureMonths)
    const startDate = values.startDate
    if (!(principal > 0) || !(tenureMonths > 0) || !startDate) throw new Error('Loan amount, tenure and start date are required.')
    return { ...values, principal, tenureMonths, annualInterestRate: KFE_LOAN_ANNUAL_RATE_PERCENT, emi: calculateEmi(principal, tenureMonths), status: values.status || 'Active' }
  }

  const loans = (await readAll('loans')).filter(record => !isDeleted(record))
  const payments = (await readAll('loan_payments')).filter(record => !isDeleted(record))
  const prepayments = (await readAll('prepayments')).filter(record => !isDeleted(record))
  const loan = loans.find(record => record.id === values.loanId)
  if (!loan) throw new Error('The selected loan does not exist.')

  if (formKey === 'loanPayment') {
    const preview = paymentAllocationPreview({ loan, payments: existingId ? payments.filter(payment => payment.id !== existingId) : payments, prepayments, amount: Number(values.amount), paidOn: values.paidOn })
    if (!preview.available) throw new Error(preview.reason === 'PAYMENT_EXCEEDS_EMI_OBLIGATIONS' ? 'Payment exceeds the payable EMI obligations. Record the excess separately as a prepayment after overdue obligations are settled.' : preview.reason)
    return { ...values, status: 'PAID', allocatedAmount: preview.allocatedAmount, allocations: preview.allocations }
  }

  const position = deriveLoanPosition({ loan, payments, prepayments, asOf: values.paidOn })
  if (position.totalOverdue > 0.005) throw new Error(`Prepayment is blocked until all overdue EMIs are settled. Current overdue: ₹${position.totalOverdue.toFixed(2)}.`)
  const estimate = calculatePrepaymentEstimate({ loan, payments, prepayments, amount: Number(values.amount), paidOn: values.paidOn })
  if (!estimate.available) throw new Error(estimate.reason)
  if (estimate.appliedAmount <= 0) throw new Error('Prepayment amount must be greater than zero.')
  return { ...values, amount: estimate.appliedAmount, outstandingBefore: estimate.outstandingBefore, outstandingAfter: estimate.outstandingAfter, effect: estimate.effect === 'CLOSE_LOAN' ? 'Close loan' : 'Reduce tenure', status: 'Applied' }
}

export const AdminRepository = {
  async list(formKey) { const records = await readAll(storeFor(formKey)); return records.filter(record => !isDeleted(record) && (!isSettingsForm(formKey) || record.settingKey === formKey)).map(record => toFormRecord(formKey, record)).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))) },
  async get(formKey, id) { return toFormRecord(formKey, await readOne(storeFor(formKey), id)) },
  async save(formKey, values, existingId = null) {
    const definition = getAdminFormDefinition(formKey)
    if (definition) { const validation = validateAdminForm(definition, values); if (!validation.valid) throw new Error(`Invalid ${formKey}: ${Object.values(validation.errors).join(' ')}`); values = validation.values }
    const db = await initializeCanonicalStorage(); const storeName = storeFor(formKey); const existing = existingId ? await this.get(formKey, existingId) : null
    if (formKey === 'shift' && !existing) throw new Error('Shift corrections require an existing Work-created shift.')
    const existingRaw = existing ? { id: existing.id, createdAt: existing.createdAt, updatedAt: existing.updatedAt, deletedAt: existing.deletedAt, deleted: existing.deleted, ...existing.values } : null
    await validateRelationships(db, formKey, values)
    const financeValues = isFinanceForm(formKey) ? await prepareFinanceValues(formKey, values, existingId) : values
    const record = formKey === 'shift' ? { ...existingRaw, ...structuredClone(financeValues), id: existingRaw.id, createdAt: existingRaw.createdAt, updatedAt: new Date().toISOString() } : toStoredRecord(formKey, financeValues, existingRaw)
    const now = record.updatedAt; const action = existing ? 'UPDATE' : 'CREATE'
    return new Promise((resolve, reject) => {
      const stores = [storeName, 'pending_mutations', 'audit_history']
      const tx = db.transaction(stores, 'readwrite')
      try { tx.objectStore(storeName).put(record); writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: record.id, entityType: formKey, action, payload: record, createdAt: now }) } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: [storeName], reason: `admin:${action}` }); resolve(toFormRecord(formKey, record)) }; tx.onerror = () => reject(tx.error || new Error(`Failed to save ${formKey}.`)); tx.onabort = () => reject(tx.error || new Error(`Save ${formKey} aborted.`))
    })
  },
  async remove(formKey, id) {
    if (formKey === 'shift') throw new Error('Shift records are not deletable; correct the Work-created source record instead.')
    const db = await initializeCanonicalStorage(); const storeName = storeFor(formKey); const now = new Date().toISOString()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName, 'pending_mutations', 'audit_history'], 'readwrite'); const store = tx.objectStore(storeName); const request = store.get(id)
      request.onsuccess = () => { const record = request.result; if (!record) { try { tx.abort() } catch (_) {}; reject(new Error(`Cannot delete missing ${formKey} record.`)); return }; record.deletedAt = now; record.updatedAt = now; record.deleted = true; store.put(record); writeMutationAndAudit(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), { entityId: id, entityType: formKey, action: 'DELETE', payload: { id, formKey, deletedAt: now }, createdAt: now }) }
      request.onerror = () => { try { tx.abort() } catch (_) {}; reject(request.error || new Error(`Failed to read ${formKey} for deletion.`)) }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: [storeName], reason: 'admin:DELETE' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error(`Failed to delete ${formKey}.`)); tx.onabort = () => reject(tx.error || new Error(`Delete ${formKey} aborted.`))
    })
  },
}
export const CANONICAL_ADMIN_STORE_MAP = FORM_STORE
