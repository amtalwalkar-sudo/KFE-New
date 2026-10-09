import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'

const clone = value => {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

export function formDraftIdentity({ formId, workflowStep, parentType, parentId = null, ownerId = null, workflowId = null } = {}) {
  if (!String(formId || '').trim()) throw new Error('Form draft requires formId.')
  if (!String(workflowStep || '').trim()) throw new Error('Form draft requires workflowStep.')
  if (!String(parentType || '').trim()) throw new Error('Form draft requires parentType.')
  const canonicalParent = String(parentId || '').trim()
  const temporaryWorkflow = String(workflowId || '').trim()
  if (!canonicalParent && !temporaryWorkflow) throw new Error('Form draft requires a canonical parent ID or temporary workflow ID.')
  if (String(parentType).toUpperCase() === 'TRIP' && (!canonicalParent || !String(ownerId || '').trim())) {
    throw new Error('Trip drafts require both the canonical Trip ID and owning Shift ID.')
  }
  const identity = {
    formId: String(formId).trim(),
    workflowStep: String(workflowStep).trim(),
    parentType: String(parentType).trim().toUpperCase(),
    parentId: canonicalParent || null,
    ownerId: String(ownerId || '').trim() || null,
    workflowId: temporaryWorkflow || null
  }
  return { ...identity, id: JSON.stringify([identity.formId, identity.workflowStep, identity.parentType, identity.parentId, identity.ownerId, identity.workflowId]) }
}

export function isFormDraftClearAuthorized({ committed = false, confirmedDiscard = false } = {}) {
  return committed === true || confirmedDiscard === true
}

export const FormDraftRepository = Object.freeze({
  async save(identityInput, values) {
    const identity = formDraftIdentity(identityInput)
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Form draft values must be an object.')
    const db = await initializeCanonicalStorage()
    const record = { ...identity, values: clone(values), updatedAt: new Date().toISOString() }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['form_drafts'], 'readwrite')
      tx.objectStore('form_drafts').put(record)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error || new Error('Form draft could not be saved.'))
      tx.onabort = () => reject(tx.error || new Error('Form draft save was aborted.'))
    })
    notifyCanonicalDataChanged({ stores: ['form_drafts'], reason: 'form-draft:save' })
    return record
  },

  async get(identityInput) {
    const identity = formDraftIdentity(identityInput)
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['form_drafts'], 'readonly')
      const request = tx.objectStore('form_drafts').get(identity.id)
      request.onsuccess = () => {
        const record = request.result
        if (!record || record.formId !== identity.formId || record.workflowStep !== identity.workflowStep ||
            record.parentType !== identity.parentType || record.parentId !== identity.parentId ||
            record.ownerId !== identity.ownerId || record.workflowId !== identity.workflowId) {
          resolve(null)
          return
        }
        resolve(record)
      }
      request.onerror = () => reject(request.error || new Error('Form draft could not be restored.'))
    })
  },

  async latestWorkflow(formId, workflowStep, parentType = 'WORKFLOW') {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['form_drafts'], 'readonly')
      const request = tx.objectStore('form_drafts').getAll()
      request.onsuccess = () => {
        const record = (request.result || [])
          .filter(item => item.formId === formId && item.workflowStep === workflowStep &&
            item.parentType === String(parentType).toUpperCase() && item.workflowId && !item.parentId)
          .sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))[0]
        resolve(record || null)
      }
      request.onerror = () => reject(request.error || new Error('Temporary workflow draft lookup failed.'))
    })
  },

  async clear(identityInput, { committed = false, confirmedDiscard = false } = {}) {
    if (!isFormDraftClearAuthorized({ committed, confirmedDiscard })) {
      throw new Error('Form draft can only be cleared after successful commitment or explicit confirmed discard.')
    }
    const identity = formDraftIdentity(identityInput)
    const db = await initializeCanonicalStorage()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['form_drafts'], 'readwrite')
      tx.objectStore('form_drafts').delete(identity.id)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error || new Error('Form draft could not be cleared.'))
      tx.onabort = () => reject(tx.error || new Error('Form draft clear was aborted.'))
    })
    notifyCanonicalDataChanged({ stores: ['form_drafts'], reason: committed ? 'form-draft:committed' : 'form-draft:confirmed-discard' })
    return true
  },

  newWorkflowId() { return generateUUID() }
})
