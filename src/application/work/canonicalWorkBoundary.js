import { WorkRuntimePorts } from './workRuntimePorts.js'
import { BrowserCanonicalWorkService } from '../../infrastructure/work/browserCanonicalWork.js'
import { generateUUID } from '../../utils/uuid.js'

const requireText = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`)
  return value.trim()
}

/** Shared application boundary for native canonical writes and browser canonical records. */
export const CanonicalWorkBoundary = Object.freeze({
  async putRecord(input) {
    const normalized = {
      operationId: requireText(input?.operationId, 'operationId'),
      entityType: requireText(input?.entityType, 'entityType'),
      record: input?.record,
      expectedUpdatedAt: input?.expectedUpdatedAt ?? null,
      expectAbsent: input?.expectAbsent === true,
    }
    if (!normalized.record || typeof normalized.record !== 'object' || Array.isArray(normalized.record)) throw new Error('record must be an object.')
    if (WorkRuntimePorts.canonicalWork.isAvailable()) return WorkRuntimePorts.canonicalWork.putRecord(normalized)
    return BrowserCanonicalWorkService.putRecord(normalized)
  },
  async persistTripBoundarySnapshot(input) {
    const normalized = {
      operationId: requireText(input?.operationId, 'operationId'),
      tripId: requireText(input?.tripId, 'tripId'),
      field: requireText(input?.field, 'field'),
      snapshot: input?.snapshot,
    }
    if (!['tripStartLocation', 'tripEndLocation'].includes(normalized.field)) throw new Error('Unsupported trip-boundary snapshot field.')
    if (!normalized.snapshot || typeof normalized.snapshot !== 'object' || Array.isArray(normalized.snapshot)) throw new Error('snapshot must be an object.')
    if (!WorkRuntimePorts.canonicalWork.isAvailable()) throw new Error('Dedicated trip-boundary persistence is available only with native canonical storage.')
    return WorkRuntimePorts.canonicalWork.persistTripBoundarySnapshot(normalized)
  },
  async updateTripBoundaryPlaceName(input) {
    const normalized = {
      operationId: requireText(input?.operationId, 'operationId'),
      tripId: requireText(input?.tripId, 'tripId'),
      field: requireText(input?.field, 'field'),
      placeName: requireText(input?.placeName, 'placeName'),
    }
    if (!['tripStartLocation', 'tripEndLocation'].includes(normalized.field)) throw new Error('Unsupported trip-boundary place-name field.')
    if (WorkRuntimePorts.canonicalWork.isAvailable()) return WorkRuntimePorts.canonicalWork.updateTripBoundaryPlaceName(normalized)
    return BrowserCanonicalWorkService.updateTripBoundaryPlaceName(normalized)
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
    const result = await WorkRuntimePorts.canonicalWork.listRecords({ entityType: 'GPS_SNAPSHOT', limit: 1000 })
    return Array.isArray(result?.records) ? result.records : []
  },
  async getRecord(input) { return WorkRuntimePorts.canonicalWork.isAvailable() ? WorkRuntimePorts.canonicalWork.getRecord(input) : BrowserCanonicalWorkService.getRecord(input) },
  async listRecords(input) { return WorkRuntimePorts.canonicalWork.isAvailable() ? WorkRuntimePorts.canonicalWork.listRecords(input) : BrowserCanonicalWorkService.listRecords(input) },
  async getOperation(operationId) { return WorkRuntimePorts.canonicalWork.isAvailable() ? WorkRuntimePorts.canonicalWork.getOperation(operationId) : BrowserCanonicalWorkService.getOperation(operationId) },
  createOperationId() { return generateUUID() },
})
