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
    const normalized = { operationId: requireText(input?.operationId, 'operationId'), entityType: requireText(input?.entityType, 'entityType'), record: input?.record }
    if (!normalized.record || typeof normalized.record !== 'object' || Array.isArray(normalized.record)) throw new Error('record must be an object.')
    if (WorkRuntimePorts.canonicalWork.isAvailable()) return WorkRuntimePorts.canonicalWork.putRecord(normalized)
    return BrowserCanonicalWorkService.putRecord(normalized)
  },
  async getRecord(input) { return WorkRuntimePorts.canonicalWork.isAvailable() ? WorkRuntimePorts.canonicalWork.getRecord(input) : BrowserCanonicalWorkService.getRecord(input) },
  async listRecords(input) { return WorkRuntimePorts.canonicalWork.isAvailable() ? WorkRuntimePorts.canonicalWork.listRecords(input) : BrowserCanonicalWorkService.listRecords(input) },
  async getOperation(operationId) { return WorkRuntimePorts.canonicalWork.isAvailable() ? WorkRuntimePorts.canonicalWork.getOperation(operationId) : BrowserCanonicalWorkService.getOperation(operationId) },
  createOperationId() { return generateUUID() },
})
