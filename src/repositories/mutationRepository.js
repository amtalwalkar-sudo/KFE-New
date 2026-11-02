import { openCanonicalDB } from '../utils/indexedDB.js'

// MutationRepository recovers legacy interrupted mutation records in canonical storage.
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


}
