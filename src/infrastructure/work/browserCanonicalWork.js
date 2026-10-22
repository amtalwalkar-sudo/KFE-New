import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../../utils/indexedDB.js'

const STORE_BY_ENTITY = Object.freeze({ SHIFT: 'shifts', TRIP: 'trips', GPS_SNAPSHOT: 'gps_snapshots', MOVEMENT_ARTIFACT: 'movement_artifacts' })
const requireText = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`)
  return value.trim()
}
const browserStoreFor = entityType => {
  const store = STORE_BY_ENTITY[entityType]
  if (!store) throw new Error(`Unsupported canonical Work entity type: ${entityType}`)
  return store
}
const operationRecord = (operationId, entityType, entityId, outcome, createdAt) => ({ id: operationId, command: 'PUT_RECORD', entityType, entityId, status: 'ACCEPTED', outcome, createdAt })
const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
  }
  return value
}
const jsonEquivalent = (left, right) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))

export const BrowserCanonicalWorkService = Object.freeze({
  async putRecord({ operationId, entityType, record } = {}) {
    const db = await initializeCanonicalStorage()
    const storeName = browserStoreFor(requireText(entityType, 'entityType'))
    const entityId = requireText(record?.id, 'record.id')
    const id = requireText(operationId, 'operationId')
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName, 'canonical_operations', 'audit_history'], 'readwrite')
      const records = tx.objectStore(storeName), operations = tx.objectStore('canonical_operations'), audit = tx.objectStore('audit_history')
      let outcome = null
      const existingOperation = operations.get(id)
      existingOperation.onsuccess = () => {
        try {
          if (existingOperation.result) {
            const previous = existingOperation.result
            if (previous.command !== 'PUT_RECORD' || previous.entityType !== entityType || previous.entityId !== entityId) throw new Error('operationId was already used for a different command.')
            if (!previous.outcome?.record || !jsonEquivalent(previous.outcome.record, record)) throw new Error('operationId was already used with a different payload.')
            outcome = { accepted: previous.status === 'ACCEPTED', duplicate: true, outcome: previous.outcome }
            return
          }
          const committedAt = new Date().toISOString(), savedRecord = structuredClone(record)
          records.put(savedRecord)
          const result = { operationId: id, entityType, entityId, committedAt, record: savedRecord }
          operations.add(operationRecord(id, entityType, entityId, result, committedAt))
          audit.add({ id: `canonical-operation:${id}`, mutationId: id, entityId, entityType, action: 'PUT_RECORD', payload: savedRecord, createdAt: committedAt })
          outcome = { accepted: true, duplicate: false, outcome: result }
        } catch (error) { try { tx.abort() } catch (_) {}; reject(error) }
      }
      existingOperation.onerror = () => { try { tx.abort() } catch (_) {}; reject(existingOperation.error || new Error('Canonical operation lookup failed.')) }
      tx.oncomplete = () => {
        if (!outcome) { reject(new Error('Canonical persistence completed without an operation outcome.')); return }
        if (!outcome.duplicate) notifyCanonicalDataChanged({ stores: [storeName], reason: 'canonical-work:put-record' })
        resolve(outcome)
      }
      tx.onerror = () => reject(tx.error || new Error('Canonical Work transaction failed.'))
      tx.onabort = () => reject(tx.error || new Error('Canonical Work transaction aborted.'))
    })
  },
  async getRecord({ entityType, entityId } = {}) {
    const db = await initializeCanonicalStorage(), storeName = browserStoreFor(requireText(entityType, 'entityType')), id = requireText(entityId, 'entityId')
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], 'readonly'), request = tx.objectStore(storeName).get(id)
      request.onsuccess = () => resolve(request.result ? { found: true, record: request.result, updatedAt: request.result.updatedAt || null } : { found: false })
      request.onerror = () => reject(request.error || new Error('Canonical record query failed.'))
    })
  },
  async listRecords({ entityType, limit = 500 } = {}) {
    const db = await initializeCanonicalStorage(), storeName = browserStoreFor(requireText(entityType, 'entityType')), safeLimit = Math.max(1, Math.min(Number(limit) || 500, 1000))
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], 'readonly'), request = tx.objectStore(storeName).getAll()
      request.onsuccess = () => { const records = (request.result || []).sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')) || String(a.id).localeCompare(String(b.id))).slice(0, safeLimit); resolve({ entityType, records, count: records.length }) }
      request.onerror = () => reject(request.error || new Error('Canonical record list failed.'))
    })
  },
  async getOperation(operationId) {
    const db = await initializeCanonicalStorage(), id = requireText(operationId, 'operationId')
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['canonical_operations'], 'readonly'), request = tx.objectStore('canonical_operations').get(id)
      request.onsuccess = () => resolve(request.result ? { found: true, ...request.result } : { found: false })
      request.onerror = () => reject(request.error || new Error('Canonical operation query failed.'))
    })
  },
})
