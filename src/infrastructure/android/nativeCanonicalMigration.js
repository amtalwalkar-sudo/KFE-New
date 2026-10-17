import { openCanonicalDB, CANONICAL_DB_VERSION, CANONICAL_DB_NAME } from '../../utils/indexedDB.js'
import { NativeCanonicalWorkService } from './nativeCanonicalWork.js'

const MIGRATION_ID = 'indexeddb-v16-to-native-canonical-v1'
const SOURCE_STORES = Object.freeze([
  ['SHIFT', 'shifts'],
  ['TRIP', 'trips'],
  ['GPS_SNAPSHOT', 'gps_snapshots'],
  ['MOVEMENT_ARTIFACT', 'movement_artifacts'],
  ['PENDING_MUTATION', 'pending_mutations'],
  ['AUDIT_HISTORY', 'audit_history'],
  ['CANONICAL_OPERATION', 'canonical_operations'],
])

const readLegacySnapshot = async () => {
  const db = await openCanonicalDB()
  const names = SOURCE_STORES.map(([, store]) => store)
  for (const name of names) {
    if (!db.objectStoreNames.contains(name)) throw new Error(`Migration source store is missing: ${name}`)
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readonly')
    const entities = {}
    let failed = false
    for (const [entityType, storeName] of SOURCE_STORES) {
      const request = tx.objectStore(storeName).getAll()
      request.onsuccess = () => {
        const records = request.result || []
        if (records.some(record => !record || typeof record.id !== 'string' || !record.id.trim())) {
          failed = true
          try { tx.abort() } catch (_) {}
          reject(new Error(`Migration source contains a record without a stable id in ${storeName}.`))
          return
        }
        entities[entityType] = records.sort((a, b) => a.id.localeCompare(b.id))
      }
      request.onerror = () => {
        failed = true
        try { tx.abort() } catch (_) {}
        reject(request.error || new Error(`Could not read migration source store: ${storeName}`))
      }
    }
    tx.oncomplete = () => {
      if (!failed) resolve({
        sourceDatabase: CANONICAL_DB_NAME,
        sourceSchemaVersion: CANONICAL_DB_VERSION,
        entities,
      })
    }
    tx.onerror = () => reject(tx.error || new Error('Could not read legacy canonical records.'))
    tx.onabort = () => reject(tx.error || new Error('Legacy canonical snapshot was aborted.'))
  })
}

/**
 * One-time, source-preserving Android migration. This function never deletes or
 * rewrites IndexedDB records and does not switch the application read/write path.
 * Cutover is a later phase and is allowed only after this returns verified=true.
 */
export const NativeCanonicalMigration = Object.freeze({
  async migrateAndVerify({ migrationId = MIGRATION_ID } = {}) {
    if (!NativeCanonicalWorkService.isAvailable()) {
      throw new Error('Native canonical migration is available only on Android.')
    }
    const snapshot = await readLegacySnapshot()
    const expectedCount = Object.values(snapshot.entities).reduce((sum, records) => sum + records.length, 0)
    const imported = await NativeCanonicalWorkService.migrateLegacySnapshot({ migrationId, snapshot })
    if (imported?.migrationId !== migrationId || Number(imported.recordCount) !== expectedCount) {
      throw new Error('Native migration import count does not match the IndexedDB source snapshot.')
    }
    const verified = await NativeCanonicalWorkService.verifyLegacyMigration(migrationId)
    if (verified?.verified !== true || Number(verified.recordCount) !== expectedCount ||
        verified.snapshotHash !== imported.snapshotHash) {
      throw new Error('Native canonical migration verification did not match the source snapshot.')
    }
    return {
      migrationId,
      sourceDatabase: snapshot.sourceDatabase,
      sourceSchemaVersion: snapshot.sourceSchemaVersion,
      recordCount: expectedCount,
      countsByEntity: Object.fromEntries(Object.entries(snapshot.entities).map(([type, records]) => [type, records.length])),
      snapshotHash: verified.snapshotHash,
      verified: true,
      sourcePreserved: true,
      cutoverPerformed: false,
    }
  },
})

export { MIGRATION_ID as NATIVE_CANONICAL_MIGRATION_ID }
