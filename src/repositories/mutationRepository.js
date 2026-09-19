import { openCanonicalDB } from '../utils/indexedDB.js'

// MutationRepository is the canonical synchronization queue. Business repositories
// write pending_mutations/audit_history inside their active-source transaction, but
// these sync lifecycle methods intentionally operate on canonical storage only.
import { generateUUID } from '../utils/uuid.js'

export const MUTATION_VERSION = 1

export const buildMutationRecord = ({ entityId, entityType, action, payload, createdAt }) => ({
  id: generateUUID(),
  mutationVersion: MUTATION_VERSION,
  entityId,
  entityType,
  action,
  payload: structuredClone(payload),
  status: 'PENDING',
  retryCount: 0,
  createdAt: createdAt || new Date().toISOString()
})

export const buildAuditRecord = ({ mutationId, entityId, entityType, action, payload, createdAt }) => ({
  id: generateUUID(),
  auditVersion: 1,
  mutationId,
  entityId,
  entityType,
  action,
  payload: structuredClone(payload),
  createdAt: createdAt || new Date().toISOString()
})

export const writeMutationAndAudit = (mutationStore, auditStore, args) => {
  const mutation = buildMutationRecord(args)
  mutationStore.put(mutation)
  auditStore.put(buildAuditRecord({ ...args, mutationId: mutation.id }))
  return mutation
}

export const MutationRepository = {
  async recoverStaleSyncing() {
    const db = await openCanonicalDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readwrite')
      const store = tx.objectStore('pending_mutations')
      const req = store.getAll()
      req.onsuccess = () => {
        for (const mutation of req.result || []) {
          if (mutation.status === 'SYNCING') { mutation.status = 'PENDING'; store.put(mutation) }
        }
      }
      req.onerror = () => reject(req.error || new Error('Failed to recover stale mutations.'))
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error('Mutation recovery transaction failed.'))
      tx.onabort = () => reject(tx.error || new Error('Mutation recovery transaction aborted.'))
    })
  },
  async getPending() {
    const db = await openCanonicalDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readonly')
      const index = tx.objectStore('pending_mutations').index('createdAt')
      const req = index.getAll()
      req.onsuccess = () => resolve((req.result || []).filter(m => m.status === 'PENDING' || m.status === 'FAILED').sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)))
      req.onerror = () => reject(req.error || new Error('Failed to read pending mutations.'))
    })
  },
  async updateStatus(id, status) {
    const validStatuses = new Set(['PENDING', 'SYNCING', 'FAILED'])
    if (!validStatuses.has(status)) throw new Error(`Invalid mutation status: ${status}`)
    const db = await openCanonicalDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readwrite')
      const store = tx.objectStore('pending_mutations')
      const req = store.get(id)
      req.onsuccess = () => { const record = req.result; if (!record) return; record.status = status; if (status === 'FAILED') record.retryCount = Number(record.retryCount) + 1 || 1; store.put(record) }
      req.onerror = () => reject(req.error || new Error('Failed to read mutation state.'))
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error('Mutation state transaction failed.'))
      tx.onabort = () => reject(tx.error || new Error('Mutation state transaction aborted.'))
    })
  },
  async remove(id) {
    const db = await openCanonicalDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readwrite')
      tx.objectStore('pending_mutations').delete(id)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error('Mutation removal failed.'))
      tx.onabort = () => reject(tx.error || new Error('Mutation removal transaction aborted.'))
    })
  }
}
