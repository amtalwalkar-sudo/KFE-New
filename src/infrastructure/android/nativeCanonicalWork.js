import { registerPlugin, Capacitor } from '@capacitor/core'

const NativeCanonicalWork = registerPlugin('KfeCanonicalWork')
const native = () => Capacitor?.isNativePlatform?.() === true
const requireNative = () => {
  if (!native()) throw new Error('Native canonical persistence is available only on Android.')
}

export const NativeCanonicalWorkService = Object.freeze({
  async putRecord({ operationId, entityType, record } = {}) {
    requireNative()
    if (!operationId || !entityType || !record?.id) throw new Error('operationId, entityType and record.id are required.')
    const result = await NativeCanonicalWork.putRecord({ operationId, entityType, record })
    if (result?.accepted !== true || !result?.outcome?.record) throw new Error('Canonical persistence did not confirm the record commit.')
    return result
  },
  async persistTripBoundarySnapshot({ operationId, tripId, field, snapshot } = {}) {
    requireNative()
    if (!operationId || !tripId || !['tripStartLocation', 'tripEndLocation'].includes(field) || !snapshot) {
      throw new Error('operationId, tripId, a supported boundary field and snapshot are required.')
    }
    const result = await NativeCanonicalWork.persistTripBoundarySnapshot({ operationId, tripId, field, snapshot })
    if (result?.accepted !== true || !result?.outcome?.record?.[field]) {
      throw new Error('Native canonical boundary snapshot was not durably acknowledged.')
    }
    return result
  },
  async migrateLegacySnapshot({ migrationId, snapshot } = {}) {
    requireNative()
    if (!migrationId || !snapshot?.entities) throw new Error('migrationId and snapshot.entities are required.')
    return NativeCanonicalWork.migrateLegacySnapshot({ migrationId, snapshot })
  },
  async verifyLegacyMigration(migrationId) {
    requireNative()
    if (!migrationId) throw new Error('migrationId is required.')
    const result = await NativeCanonicalWork.verifyLegacyMigration({ migrationId })
    if (result?.verified !== true) throw new Error('Native canonical migration was not verified.')
    return result
  },
  async getMigration(migrationId) {
    requireNative()
    if (!migrationId) throw new Error('migrationId is required.')
    return NativeCanonicalWork.getMigration({ migrationId })
  },
  async getRecord({ entityType, entityId } = {}) {
    requireNative()
    if (!entityType || !entityId) throw new Error('entityType and entityId are required.')
    return NativeCanonicalWork.getRecord({ entityType, entityId })
  },
  async listRecords({ entityType, limit = 500 } = {}) {
    requireNative()
    if (!entityType) throw new Error('entityType is required.')
    const result = await NativeCanonicalWork.listRecords({ entityType, limit })
    return { entityType, records: Array.isArray(result?.records) ? result.records : [], count: Number(result?.count) || 0 }
  },
  async getOperation(operationId) {
    requireNative()
    if (!operationId) throw new Error('operationId is required.')
    return NativeCanonicalWork.getOperation({ operationId })
  },
  isAvailable: native,
})
