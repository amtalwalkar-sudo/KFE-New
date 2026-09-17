import assert from 'node:assert/strict'
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, CANONICAL_BACKUP_STORES, BackupService } from '../application/backup/backupService.js'
import { createDropboxBackupProvider, DROPBOX_DEFAULT_BACKUP_PATH } from '../infrastructure/backup/dropboxBackupProvider.js'

const emptyStores = Object.fromEntries(CANONICAL_BACKUP_STORES.map(store => [store, []]))
const emptyCounts = Object.fromEntries(CANONICAL_BACKUP_STORES.map(store => [store, 0]))
const valid = { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 10 }, exportedAt: '2026-09-16T00:00:00.000Z', stores: emptyStores }

assert.equal(CANONICAL_BACKUP_STORES.length, 19)
assert.equal(CANONICAL_BACKUP_STORES.includes('driver_collected_data'), false)
assert.deepEqual(BackupService.getBackupSummary(valid), { exportedAt: valid.exportedAt, totalRecords: 0, counts: emptyCounts })
assert.deepEqual(BackupService.validateBackup(valid), valid)
const withRecord = structuredClone(valid)
withRecord.stores.vehicles = [{ id: 'vehicle-1', registrationNumber: 'TEST-01' }]
assert.equal(BackupService.getBackupSummary(withRecord).totalRecords, 1)
assert.throws(() => BackupService.validateBackup({ ...valid, format: 'OTHER' }), /Unsupported KFE backup format/)
assert.throws(() => BackupService.validateBackup({ ...valid, formatVersion: 4 }), /Unsupported backup format version/)
assert.throws(() => BackupService.validateBackup({ ...valid, stores: { ...emptyStores, unknown: [] } }), /store set does not exactly match/)
const missingStore = structuredClone(emptyStores); delete missingStore.settings
assert.throws(() => BackupService.validateBackup({ ...valid, stores: missingStore }), /store set does not exactly match/)
const duplicate = structuredClone(valid); duplicate.stores.vehicles = [{ id: 'x' }, { id: 'x' }]
assert.throws(() => BackupService.validateBackup(duplicate), /duplicate id/)
const badId = structuredClone(valid); badId.stores.vehicles = [{ id: '' }]
assert.throws(() => BackupService.validateBackup(badId), /invalid record/)
const serialized = BackupService.serializeBackup(withRecord)
assert.equal(typeof serialized, 'string')
assert.deepEqual(BackupService.validateBackup(serialized), withRecord)
const legacyV1Stores = Object.fromEntries([
  ...CANONICAL_BACKUP_STORES.filter(store => store !== 'audit_history').slice(0, 11).map(store => [store, []]),
  ['driver_collected_data', []],
  ...CANONICAL_BACKUP_STORES.filter(store => store !== 'audit_history').slice(11).map(store => [store, []]),
])
const legacyV1 = { format: BACKUP_FORMAT, formatVersion: 1, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 8 }, exportedAt: valid.exportedAt, stores: legacyV1Stores }
const migratedV1 = BackupService.validateBackup(legacyV1)
assert.equal(migratedV1.formatVersion, BACKUP_FORMAT_VERSION)
assert.equal(migratedV1.source.dbVersion, 10)
assert.equal('driver_collected_data' in migratedV1.stores, false)
assert.deepEqual(migratedV1.stores.audit_history, [])
const legacyV2 = structuredClone(emptyStores)
legacyV2.driver_collected_data = []
const legacyV2Backup = { format: BACKUP_FORMAT, formatVersion: 2, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 9 }, exportedAt: valid.exportedAt, stores: legacyV2 }
const migratedV2 = BackupService.validateBackup(legacyV2Backup)
assert.equal(migratedV2.formatVersion, BACKUP_FORMAT_VERSION)
assert.equal(migratedV2.source.dbVersion, 10)
assert.equal('driver_collected_data' in migratedV2.stores, false)
assert.throws(() => BackupService.validateBackup({ ...valid, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 9 } }), /supported canonical KFE database version/)
assert.equal(DROPBOX_DEFAULT_BACKUP_PATH, '/Apps/KFE/kfe-latest-backup.json')
assert.throws(() => createDropboxBackupProvider(), /Dropbox access token is required/)
const provider = createDropboxBackupProvider({ accessToken: 'test-token' })
assert.equal(provider.name, 'Dropbox')
assert.equal(typeof provider.upload, 'function')
assert.equal(typeof provider.download, 'function')
assert.equal(BackupService.getCloudBackupProviderName(), null)
await assert.rejects(() => BackupService.backupToCloud(valid), /No cloud backup provider is configured/)

console.log('Backup contract: PASS')
