import { registerPlugin, Capacitor } from '@capacitor/core'
import { getCanonicalResetBarrier } from '../../utils/indexedDB.js'

const NativeCanonicalWork = registerPlugin('KfeCanonicalWork')
const native = () => Capacitor?.isNativePlatform?.() === true
const assertNoResetInProgress = () => {
  const resetId = getCanonicalResetBarrier()
  if (resetId) throw new Error(`Native canonical mutation blocked while reset ${resetId} is pending.`)
}
const requireNative = () => {
  if (!native()) throw new Error('Native canonical persistence is available only on Android.')
}

export const NativeCanonicalWorkService = Object.freeze({
  async beginCanonicalReset(resetId) {
    requireNative()
    if (!resetId) throw new Error('resetId is required.')
    return NativeCanonicalWork.beginCanonicalReset({ resetId })
  },
  async clearCanonicalReset(resetId) {
    requireNative()
    if (!resetId) throw new Error('resetId is required.')
    return NativeCanonicalWork.clearCanonicalReset({ resetId })
  },
  async completeCanonicalReset(resetId) {
    requireNative()
    if (!resetId) throw new Error('resetId is required.')
    return NativeCanonicalWork.completeCanonicalReset({ resetId })
  },
  async getCanonicalResetState() {
    requireNative()
    return NativeCanonicalWork.getCanonicalResetState({})
  },
  async prepareCreateIntent({ entityType, intentKey, record } = {}) {
    assertNoResetInProgress()
    requireNative()
    if (!entityType || !intentKey || !record?.id) throw new Error('entityType, intentKey and record.id are required.')
    const intent = await NativeCanonicalWork.prepareCreateIntent({ entityType, intentKey, record })
    if (!intent?.intentId || !intent?.operationId || !intent?.record?.id) throw new Error('Native create intent was not durably acknowledged.')
    return intent
  },
  async completeCreateIntent(intentId) {
    assertNoResetInProgress()
    requireNative()
    if (!intentId) throw new Error('intentId is required.')
    const result = await NativeCanonicalWork.completeCreateIntent({ intentId })
    if (result?.completed !== true) throw new Error('Native create intent completion was not acknowledged.')
    return result
  },
  async putRecord({ operationId, entityType, record, expectedUpdatedAt = null, expectAbsent = false } = {}) {
    assertNoResetInProgress()
    requireNative()
    if (!operationId || !entityType || !record?.id) throw new Error('operationId, entityType and record.id are required.')
    const result = await NativeCanonicalWork.putRecord({ operationId, entityType, record, expectedUpdatedAt, expectAbsent })
    if (result?.accepted !== true || !result?.outcome?.record) throw new Error('Canonical persistence did not confirm the record commit.')
    return result
  },
  async persistTripBoundarySnapshot({ operationId, tripId, field, snapshot } = {}) {
    assertNoResetInProgress()
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
  async updateTripBoundaryPlaceName({ operationId, tripId, field, placeName } = {}) {
    assertNoResetInProgress()
    requireNative()
    if (!operationId || !tripId || !['tripStartLocation', 'tripEndLocation'].includes(field) || !String(placeName || '').trim()) {
      throw new Error('operationId, tripId, a supported boundary field and placeName are required.')
    }
    const result = await NativeCanonicalWork.updateTripBoundaryPlaceName({ operationId, tripId, field, placeName: String(placeName).trim() })
    if (result?.accepted !== true || !result?.outcome?.record?.[field]?.placeName) {
      throw new Error('Native canonical boundary label was not durably acknowledged.')
    }
    return result
  },
  async migrateLegacySnapshot({ migrationId, snapshot } = {}) {
    assertNoResetInProgress()
    requireNative()
    if (!migrationId || !snapshot?.entities) throw new Error('migrationId and snapshot.entities are required.')
    return NativeCanonicalWork.migrateLegacySnapshot({ migrationId, snapshot })
  },
  async verifyLegacyMigration(migrationId) {
    assertNoResetInProgress()
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
