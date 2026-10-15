import { WorkRuntimePorts } from './workRuntimePorts.js'
import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../../utils/indexedDB.js'
import { generateUUID } from '../../utils/uuid.js'

const STORE_BY_ENTITY = Object.freeze({
  SHIFT: 'shifts',
  TRIP: 'trips',
  GPS_SNAPSHOT: 'gps_snapshots',
  MOVEMENT_ARTIFACT: 'movement_artifacts',
})
const requireText = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`)
  return value.trim()
}
const browserStoreFor = entityType => {
  const store = STORE_BY_ENTITY[entityType]
  if (!store) throw new Error(`Unsupported canonical Work entity type: ${entityType}`)
  return store
}
const operationRecord = (operationId, entityType, entityId, outcome, createdAt) => ({
  id: operationId, command: 'PUT_RECORD', entityType, entityId, status: 'ACCEPTED', outcome, createdAt
})

const browserPutRecord = async ({ operationId, entityType, record }) => {
  const db = await initializeCanonicalStorage()
  const storeName = browserStoreFor(entityType)
  const entityId = requireText(record?.id, 'record.id')
  const id = requireText(operationId, 'operationId')
  const type = requireText(entityType, 'entityType')
  const createdAt = new Date().toISOString()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName, 'canonical_operations', 'audit_history'], 'readwrite')
    const records = tx.objectStore(storeName)
    const operations = tx.objectStore('canonical_operations')
    const audit = tx.objectStore('audit_history')
    let outcome = null
    const existingOperation = operations.get(id)
    existingOperation.onsuccess = () => {
      try {
        if (existingOperation.result) {
          const previous = existingOperation.result
          if (previous.command !== 'PUT_RECORD' || previous.entityType !== type || previous.entityId !== entityId) {
            throw new Error('operationId was already used for a different command.')
          }
          outcome = { accepted: previous.status === 'ACCEPTED', duplicate: true, outcome: previous.outcome }
          return
        }
        const committedAt = new Date().toISOString()
        const savedRecord = structuredClone(record)
        records.put(savedRecord)
        const result = { operationId: id, entityType: type, entityId, committedAt, record: savedRecord }
        operations.add(operationRecord(id, type, entityId, result, committedAt))
        audit.add({
          id: `canonical-operation:${id}`,
          mutationId: id,
          entityId,
          entityType: type,
          action: 'PUT_RECORD',
          payload: savedRecord,
          createdAt: committedAt,
        })
        outcome = { accepted: true, duplicate: false, outcome: result }
      } catch (error) {
        try { tx.abort() } catch (_) {}
        reject(error)
      }
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
}
const browserGetRecord = async ({ entityType, entityId }) => {
  const db = await initializeCanonicalStorage()
  const storeName = browserStoreFor(requireText(entityType, 'entityType'))
  const id = requireText(entityId, 'entityId')
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const request = tx.objectStore(storeName).get(id)
    request.onsuccess = () => resolve(request.result ? { found: true, record: request.result, updatedAt: request.result.updatedAt || null } : { found: false })
    request.onerror = () => reject(request.error || new Error('Canonical record query failed.'))
  })
}
const browserListRecords = async ({ entityType, limit = 500 }) => {
  const db = await initializeCanonicalStorage()
  const storeName = browserStoreFor(requireText(entityType, 'entityType'))
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 1000))
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly')
    const request = tx.objectStore(storeName).getAll()
    request.onsuccess = () => { const records = (request.result || []).sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '') || String(a.id).localeCompare(String(b.id)))).slice(0, safeLimit); resolve({ entityType, records, count: records.length }) }
    request.onerror = () => reject(request.error || new Error('Canonical record list failed.'))
  })
}
const browserGetOperation = async operationId => {
  const db = await initializeCanonicalStorage()
  const id = requireText(operationId, 'operationId')
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['canonical_operations'], 'readonly')
    const request = tx.objectStore('canonical_operations').get(id)
    request.onsuccess = () => resolve(request.result ? { found: true, ...request.result } : { found: false })
    request.onerror = () => reject(request.error || new Error('Canonical operation query failed.'))
  })
}

/**
 * Shared application boundary. Browser writes remain IndexedDB-backed; Android
 * writes use the native SQLite store. This primitive is deliberately limited to
 * shift/trip/GPS records; feature repositories will be migrated in their own runs.
 */
export const CanonicalWorkBoundary = Object.freeze({
  async putRecord(input) {
    const normalized = {
      operationId: requireText(input?.operationId, 'operationId'),
      entityType: requireText(input?.entityType, 'entityType'),
      record: input?.record,
    }
    if (!normalized.record || typeof normalized.record !== 'object' || Array.isArray(normalized.record)) throw new Error('record must be an object.')
    if (WorkRuntimePorts.canonicalWork.isAvailable()) return WorkRuntimePorts.canonicalWork.putRecord(normalized)
    return browserPutRecord(normalized)
  },
  async getRecord(input) {
    if (WorkRuntimePorts.canonicalWork.isAvailable()) return WorkRuntimePorts.canonicalWork.getRecord(input)
    return browserGetRecord(input)
  },
  async listRecords(input) {
    if (WorkRuntimePorts.canonicalWork.isAvailable()) return WorkRuntimePorts.canonicalWork.listRecords(input)
    return browserListRecords(input)
  },
  async getOperation(operationId) {
    if (WorkRuntimePorts.canonicalWork.isAvailable()) return WorkRuntimePorts.canonicalWork.getOperation(operationId)
    return browserGetOperation(operationId)
  },
  createOperationId() { return generateUUID() },
})
