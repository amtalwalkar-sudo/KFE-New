import assert from 'node:assert/strict'
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, CANONICAL_BACKUP_STORES, BackupService } from '../application/backup/backupService.js'

const stores = Object.fromEntries(CANONICAL_BACKUP_STORES.map(store => [store, []]))
const snapshot = {
  format: BACKUP_FORMAT,
  formatVersion: BACKUP_FORMAT_VERSION,
  source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 10 },
  exportedAt: '2026-09-17T00:00:00.000Z',
  stores,
}

assert.equal(typeof BackupService.createBackup, 'function')
assert.equal(typeof BackupService.serializeBackup, 'function')
assert.equal(typeof BackupService.readBackupText, 'function')
assert.equal(typeof BackupService.saveLocalBackup, 'function')
assert.equal(typeof BackupService.getLocalBackup, 'function')
assert.equal(typeof BackupService.restoreBackup, 'function')
assert.equal(typeof BackupService.requestLocalBackupCheckpoint, 'function')
assert.equal(typeof BackupService.maybeDailyLocalBackup, 'function')
assert.equal(CANONICAL_BACKUP_STORES.length, 19)
assert.equal(CANONICAL_BACKUP_STORES.includes('driver_collected_data'), false)

const record = structuredClone(snapshot)
record.stores.trips = [{ id: 'trip-1', fare: 327, distanceKm: 18.4 }]
const serialized = BackupService.serializeBackup(record)
assert.deepEqual(BackupService.readBackupText(serialized), record)
assert.equal(BackupService.getBackupSummary(record).totalRecords, 1)

const legacyV1 = structuredClone(record)
legacyV1.formatVersion = 1
legacyV1.source.dbVersion = 8
legacyV1.stores = Object.fromEntries(Object.entries(legacyV1.stores).filter(([name]) => name !== 'audit_history'))
const migratedV1 = BackupService.readBackupText(BackupService.serializeBackup({ ...legacyV1, formatVersion: 1 }))
assert.equal(migratedV1.formatVersion, BACKUP_FORMAT_VERSION)
assert.equal(migratedV1.source.dbVersion, 10)
assert.deepEqual(migratedV1.stores.audit_history, [])

const legacyV2 = structuredClone(record)
legacyV2.formatVersion = 2
legacyV2.source.dbVersion = 9
legacyV2.stores.driver_collected_data = []
const migratedV2 = BackupService.readBackupText(BackupService.serializeBackup(legacyV2))
assert.equal(migratedV2.formatVersion, BACKUP_FORMAT_VERSION)
assert.equal(migratedV2.source.dbVersion, 10)
assert.equal('driver_collected_data' in migratedV2.stores, false)

const malformed = structuredClone(record)
malformed.stores.trips = [{ id: 'trip-1' }, { id: 'trip-1' }]
assert.throws(() => BackupService.validateBackup(malformed), /duplicate id/)
assert.throws(() => BackupService.validateBackup('{not-json'), /not valid JSON/)
assert.throws(() => BackupService.validateBackup({ ...record, source: { dbName: 'other', dbVersion: 10 } }), /source does not match/)
assert.throws(() => BackupService.validateBackup({ ...record, stores: { ...record.stores, unexpected: [] } }), /store set does not exactly match/)

console.log('Phase 8 Backup & Restore contract: PASS')
