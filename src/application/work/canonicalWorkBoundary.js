import { WorkRuntimePorts } from './workRuntimePorts.js'
import { generateUUID } from '../../utils/uuid.js'
import { assertLifecycleStorageAvailable } from './lifecycleStorageGuard.js'

const requireText = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`)
  return value.trim()
}

const nativeCanonicalAvailable = () => { try { return WorkRuntimePorts.canonicalWork.isAvailable() === true } catch (_) { return false } }
const requireCanonicalWriteRoute = () => {
  let platform = null
  try { platform = WorkRuntimePorts.platform.getPlatform() } catch (_) {}
  return assertLifecycleStorageAvailable({ platform, nativeAvailable: nativeCanonicalAvailable() })
}

/** Shared application boundary for native canonical writes and browser canonical records. */
export const CanonicalWorkBoundary = Object.freeze({
  isNativeAvailable() { return nativeCanonicalAvailable() },
  async prepareCreateIntent(input) {
    if (!WorkRuntimePorts.canonicalWork.isAvailable()) throw new Error('Durable create intents require native canonical storage.')
    return WorkRuntimePorts.canonicalWork.prepareCreateIntent(input)
  },
  async completeCreateIntent(intentId) {
    if (!WorkRuntimePorts.canonicalWork.isAvailable()) throw new Error('Durable create intents require native canonical storage.')
    return WorkRuntimePorts.canonicalWork.completeCreateIntent(intentId)
  },
  async putRecord(input) {
    const normalized = {
      operationId: requireText(input?.operationId, 'operationId'),
      entityType: requireText(input?.entityType, 'entityType'),
      record: input?.record,
      expectedUpdatedAt: input?.expectedUpdatedAt ?? null,
      expectAbsent: input?.expectAbsent === true,
    }
    if (!normalized.record || typeof normalized.record !== 'object' || Array.isArray(normalized.record)) throw new Error('record must be an object.')
    const nativeAvailable = requireCanonicalWriteRoute()
    if (nativeAvailable) return WorkRuntimePorts.canonicalWork.putRecord(normalized)
    return WorkRuntimePorts.browserCanonicalWork.putRecord(normalized)
  },
  async persistEventLocationSnapshot(snapshot) {
    if (!snapshot?.id || !snapshot?.entityType || !snapshot?.entityId || !snapshot?.eventType) {
      throw new Error('A complete event location snapshot is required.')
    }
    if (!WorkRuntimePorts.canonicalWork.isAvailable()) return { accepted: true, native: false }
    const record = { ...snapshot, updatedAt: snapshot.updatedAt || snapshot.createdAt || new Date().toISOString() }
    return WorkRuntimePorts.canonicalWork.putRecord({
      operationId: `gps-snapshot-${snapshot.id}-${record.updatedAt}`,
      entityType: 'GPS_SNAPSHOT',
      record,
    })
  },
  async listEventLocationSnapshots() {
    if (!WorkRuntimePorts.canonicalWork.isAvailable()) return []
    const records = []
    const pageSize = 500
    let offset = 0
    let totalCount = Infinity
    while (offset < totalCount) {
      const page = await WorkRuntimePorts.canonicalWork.listRecords({ entityType: 'GPS_SNAPSHOT', limit: pageSize, offset })
      const rows = Array.isArray(page?.records) ? page.records : []
      totalCount = Number(page?.totalCount ?? page?.count ?? rows.length)
      records.push(...rows)
      if (!rows.length) break
      offset += rows.length
    }
    return records
  },
  async getEventLocationSnapshot(snapshotId) {
    if (!snapshotId || !WorkRuntimePorts.canonicalWork.isAvailable()) return null
    const result = await WorkRuntimePorts.canonicalWork.getRecord({ entityType: 'GPS_SNAPSHOT', entityId: snapshotId })
    if (!result || result.found === false) return null
    return result.record || result
  },
  async getRecord(input) { return WorkRuntimePorts.canonicalWork.isAvailable() ? WorkRuntimePorts.canonicalWork.getRecord(input) : WorkRuntimePorts.browserCanonicalWork.getRecord(input) },
  async listRecords(input) { return WorkRuntimePorts.canonicalWork.isAvailable() ? WorkRuntimePorts.canonicalWork.listRecords(input) : WorkRuntimePorts.browserCanonicalWork.listRecords(input) },
  async getOperation(operationId) { return WorkRuntimePorts.canonicalWork.isAvailable() ? WorkRuntimePorts.canonicalWork.getOperation(operationId) : WorkRuntimePorts.browserCanonicalWork.getOperation(operationId) },
  createOperationId() { return generateUUID() },
})
