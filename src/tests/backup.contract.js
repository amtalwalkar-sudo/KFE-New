import assert from 'node:assert/strict'
import fs from 'node:fs'
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, CANONICAL_BACKUP_STORES, BackupService } from '../application/backup/backupService.js'
import { createDropboxBackupProvider, DROPBOX_DEFAULT_BACKUP_PATH } from '../infrastructure/backup/dropboxBackupProvider.js'
import { mergeCanonicalBackupSnapshot } from '../repositories/backupRepository.js'
const emptyStores = Object.fromEntries(CANONICAL_BACKUP_STORES.map(store => [store, []]))
const emptyCounts = Object.fromEntries(CANONICAL_BACKUP_STORES.map(store => [store, 0]))
const valid = { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 13 }, exportedAt: '2026-09-16T00:00:00.000Z', stores: emptyStores }
const startupSource = fs.readFileSync('src/main.js', 'utf8'); assert.ok(startupSource.includes('retryCloudBackupOnStartup = retryCloudBackup'), 'Foreground automatic backup retries are registered for app lifecycle events.'); assert.match(startupSource, /StartupService\.startApplication\(\)\.then\(\(\) => \{[\s\S]*window\.__KFE_STARTUP_READY__ = true[\s\S]*retryCloudBackupOnStartup\?\.\(\)/, 'The initial automatic Dropbox attempt waits for canonical startup initialization.');
const lifecycleSource = fs.readFileSync('src/application/backup/cloudBackupLifecycle.js', 'utf8'); assert.match(lifecycleSource, /if \(beforeBackup\) await beforeBackup\(\)\s+const backup = await BackupService\.createBackup\(\)/, 'Optional pre-backup hooks run before snapshot creation.'); assert.doesNotMatch(fs.readFileSync('src/main.js', 'utf8'), /recoverNativeGpsTraces/, 'Backup lifecycle does not depend on trace recovery.');
const backupSource = fs.readFileSync('src/application/backup/backupService.js', 'utf8'); assert.match(backupSource, /dbVersion: CANONICAL_DB_VERSION/, 'New backups identify the current canonical IndexedDB schema.'); assert.match(backupSource, /\[12, 13, 15, CANONICAL_DB_VERSION\]/, 'Current backups and supported historical schema versions remain readable.'); assert.match(fs.readFileSync('src/constants/canonicalDatabase.js', 'utf8'), /CANONICAL_DB_VERSION = 16/);
assert.equal(CANONICAL_BACKUP_STORES.length, 21); assert.equal(CANONICAL_BACKUP_STORES.includes('driver_collected_data'), false); assert.deepEqual(BackupService.getBackupSummary(valid), { exportedAt: valid.exportedAt, totalRecords: 0, counts: emptyCounts }); assert.deepEqual(BackupService.validateBackup(valid), valid)
const currentSchema = { ...valid, source: { ...valid.source, dbVersion: 16 } }; assert.deepEqual(BackupService.validateBackup(currentSchema), currentSchema)
const withRecord = structuredClone(valid); withRecord.stores.vehicles = [{ id: 'vehicle-1', registrationNumber: 'TEST-01' }]; assert.equal(BackupService.getBackupSummary(withRecord).totalRecords, 1)
assert.throws(() => BackupService.validateBackup({ ...valid, format: 'OTHER' }), /Unsupported KFE backup format/); assert.throws(() => BackupService.validateBackup({ ...valid, formatVersion: 5 }), /Unsupported backup format version/); assert.throws(() => BackupService.validateBackup({ ...valid, stores: { ...emptyStores, unknown: [] } }), /store set does not exactly match/)
const missingStore = structuredClone(emptyStores); delete missingStore.settings; assert.throws(() => BackupService.validateBackup({ ...valid, stores: missingStore }), /store set does not exactly match/)
const duplicate = structuredClone(valid); duplicate.stores.vehicles = [{ id: 'x' }, { id: 'x' }]; assert.throws(() => BackupService.validateBackup(duplicate), /duplicate id/)
const badId = structuredClone(valid); badId.stores.vehicles = [{ id: '' }]; assert.throws(() => BackupService.validateBackup(badId), /invalid record/)
assert.equal(typeof BackupService.serializeBackup(withRecord), 'string'); assert.deepEqual(BackupService.validateBackup(BackupService.serializeBackup(withRecord)), withRecord)

const currentMergeSnapshot = structuredClone(emptyStores)
currentMergeSnapshot.shifts = [
  { id: 'shift-current', status: 'ACTIVE', updatedAt: '2026-10-20T10:00:00.000Z' },
  { id: 'shift-conflict', status: 'ACTIVE', revenue: 75, updatedAt: '2026-10-20T11:00:00.000Z' },
]
const importedMergeSnapshot = structuredClone(emptyStores)
importedMergeSnapshot.shifts = [
  { id: 'shift-current', status: 'ACTIVE', updatedAt: '2026-10-20T10:00:00.000Z' },
  { id: 'shift-conflict', status: 'COMPLETED', revenue: 500, updatedAt: '2026-10-19T11:00:00.000Z' },
  { id: 'shift-from-backup', status: 'COMPLETED', revenue: 120, updatedAt: '2026-10-19T09:00:00.000Z' },
]
importedMergeSnapshot.trips = [{ id: 'trip-from-backup', shiftId: 'shift-from-backup', status: 'COMPLETED', revenue: 120 }]
const mergedBackup = mergeCanonicalBackupSnapshot(currentMergeSnapshot, importedMergeSnapshot, { sourceExportedAt: valid.exportedAt })
assert.equal(mergedBackup.snapshot.shifts.find(record => record.id === 'shift-conflict').status, 'ACTIVE', 'restore must not replace an existing same-ID record with older/conflicting backup data')
assert.ok(mergedBackup.snapshot.shifts.some(record => record.id === 'shift-from-backup'), 'restore must add backup-only records')
assert.ok(mergedBackup.snapshot.trips.some(record => record.id === 'trip-from-backup'), 'restore must merge related trip history')
assert.equal(mergedBackup.conflicts, 1)
assert.equal(mergedBackup.archivedConflicts, 1)
assert.ok(mergedBackup.snapshot.audit_history.some(record => record.action === 'RESTORE_CONFLICT_ARCHIVE' && record.entityId === 'shift-conflict' && record.payload.status === 'COMPLETED'), 'conflicting backup payload must remain recoverable in durable audit history')
const repeatedMerge = mergeCanonicalBackupSnapshot(mergedBackup.snapshot, importedMergeSnapshot, { sourceExportedAt: valid.exportedAt })
assert.equal(repeatedMerge.added, 0, 'repeating the same restore must not duplicate imported records or conflict archives')
assert.equal(repeatedMerge.snapshot.audit_history.filter(record => record.action === 'RESTORE_CONFLICT_ARCHIVE').length, 1, 'repeated restore must dedupe conflict archive records')

const PRE_FA4_BACKUP_STORES = ['shifts','fuel_logs','odoGaps','pending_mutations','days','trips','gps_snapshots','movement_artifacts','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','audit_history']
const legacyV1Stores = Object.fromEntries([...PRE_FA4_BACKUP_STORES.filter(store => store !== 'audit_history').slice(0, 11).map(store => [store, []]), ['driver_collected_data', []], ...PRE_FA4_BACKUP_STORES.filter(store => store !== 'audit_history').slice(11).map(store => [store, []])])
const legacyV1 = { format: BACKUP_FORMAT, formatVersion: 1, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 8 }, exportedAt: valid.exportedAt, stores: legacyV1Stores }; const migratedV1 = BackupService.validateBackup(legacyV1); assert.equal(migratedV1.formatVersion, BACKUP_FORMAT_VERSION); assert.equal(migratedV1.source.dbVersion, 16); assert.equal('driver_collected_data' in migratedV1.stores, false); assert.deepEqual(migratedV1.stores.audit_history, [])
const legacyV2Stores = Object.fromEntries([...PRE_FA4_BACKUP_STORES.map(store => [store, []]), ['driver_collected_data', []]]); const legacyV2Backup = { format: BACKUP_FORMAT, formatVersion: 2, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 9 }, exportedAt: valid.exportedAt, stores: legacyV2Stores }; const migratedV2 = BackupService.validateBackup(legacyV2Backup); assert.equal(migratedV2.formatVersion, BACKUP_FORMAT_VERSION); assert.equal(migratedV2.source.dbVersion, 16); assert.equal('driver_collected_data' in migratedV2.stores, false)
assert.throws(() => BackupService.validateBackup({ ...valid, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 9 } }), /supported canonical KFE database version/); assert.equal(DROPBOX_DEFAULT_BACKUP_PATH, '/Apps/KFE/kfe-latest-backup.json'); assert.throws(() => createDropboxBackupProvider(), /Dropbox access token is required/); const provider = createDropboxBackupProvider({ accessToken: 'test-token' }); assert.equal(provider.name, 'Dropbox'); assert.equal(typeof provider.upload, 'function'); assert.equal(typeof provider.download, 'function'); assert.equal(BackupService.getCloudBackupProviderName(), null); await assert.rejects(() => BackupService.backupToCloud(valid), /No cloud backup provider is configured/)

const restoreRepositorySource = fs.readFileSync('src/repositories/backupRepository.js', 'utf8')
const restoreMethodSource = restoreRepositorySource.slice(restoreRepositorySource.indexOf('async restoreCanonicalSnapshot'), restoreRepositorySource.indexOf('async resetCanonicalData'))
assert.match(restoreMethodSource, /db\.transaction\(stores, 'readwrite'\)/, 'Restore merge must be atomic across canonical stores')
assert.match(restoreMethodSource, /tx\.objectStore\(storeName\)\.getAll\(\)/, 'Restore must compare the backup with current records inside the transaction')
assert.match(restoreMethodSource, /mergeCanonicalBackupSnapshot\(authoritativeSnapshot, snapshot/, 'Restore must merge authoritative native records, current browser records, and imported backup data without replacement')
assert.match(restoreMethodSource, /store\.add\(structuredClone\(record\)\)/, 'Restore only adds records after merge decisions')
assert.doesNotMatch(restoreMethodSource, /store\.clear\(/, 'Restore must never blindly clear current canonical records')
assert.match(backupSource, /restoreCanonicalSnapshot\(backup\.stores, \{[\s\S]*authoritativeRecords: afterNative/)
assert.match(backupSource, /saveLocalBackup\(await createBackup\(\)\)/, 'Local recovery checkpoint after restore must contain merged current + backup data')
assert.match(fs.readFileSync('src/components/admin/BackupRestorePanel.vue', 'utf8'), /Current records were preserved/, 'Restore status must explain the loss-protecting merge policy')
assert.doesNotMatch(fs.readFileSync('src/components/admin/BackupRestorePanel.vue', 'utf8'), /This replaces the current KFE dataset/, 'Restore confirmation must not claim that current records are replaced.')

const backupFileAdapterSource = fs.readFileSync('src/presentation/backup/backupFileAdapter.js', 'utf8'); assert.match(backupFileAdapterSource, /setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 1000\)/, 'Blob URL revocation is deferred so mobile browsers can start the backup download.');
const nativeBackupPluginSource = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeBackupFilePlugin.java', 'utf8'); assert.match(nativeBackupPluginSource, /Intent\.ACTION_CREATE_DOCUMENT/, 'Android export opens a system save-file picker instead of relying on WebView blob downloads.'); assert.match(nativeBackupPluginSource, /openOutputStream\(destination, "wt"\)/, 'Android export writes the JSON bytes to the user-selected destination.'); assert.match(fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/MainActivity.java', 'utf8'), /registerPlugin\(KfeBackupFilePlugin\.class\)/, 'Native backup file plugin is registered in MainActivity.');
assert.match(nativeBackupPluginSource, /Intent\.ACTION_OPEN_DOCUMENT/, 'Android restore opens the system document picker so JSON files can be selected from phone storage.'); assert.match(nativeBackupPluginSource, /openInputStream\(source\)/, 'Android restore reads the selected document through ContentResolver.'); assert.match(backupFileAdapterSource, /NativeBackupFile\.open\(\)/, 'Native restore routes file selection through the Android document picker.');
assert.match(backupSource, /mergeBackupWorkIntoNative\(backup, beforeNative\)/, 'Restore imports missing SHIFT/TRIP records into SQLite before updating the browser mirror.'); assert.match(backupSource, /NativeCanonicalWorkService\.putRecord\(\{ operationId, entityType, record, expectAbsent: true \}\)/, 'Native restore never overwrites an existing same-ID SQLite record.'); assert.match(backupSource, /NativeCanonicalWorkService\.getOperation\(operationId\)/, 'Native restore verifies uncertain commits by durable operation ID before retry.'); assert.match(backupSource, /authoritativeRecords: afterNative/, 'The post-restore IndexedDB merge uses SQLite work records as Android authority.'); assert.match(restoreMethodSource, /Array\.isArray\(authoritativeRecords\?\.\[storeName\]\)/, 'Native authoritative records are reconciled for each supported work store.'); assert.match(restoreMethodSource, /store\.put\(structuredClone\(record\)\)/, 'Native-authoritative work records replace stale browser mirrors only after archiving the displaced payload.'); assert.match(restoreMethodSource, /nativeConflictArchives\.push/, 'Native-vs-browser same-ID conflicts remain recoverable in audit history.');
const backupPanelSource = fs.readFileSync('src/components/admin/BackupRestorePanel.vue', 'utf8'); assert.match(backupPanelSource, /BackupService\.createBackup\(\),15000/, 'A stalled canonical snapshot becomes a visible backup error instead of an indefinite spinner.'); assert.match(backupPanelSource, /await withTimeout\(downloadBackupText\(/, 'The success message waits for the export adapter to finish.');
const restoreJournalSource = fs.readFileSync('src/repositories/backupRepository.js', 'utf8'); assert.match(restoreJournalSource, /LOCAL_BACKUP_DB_VERSION = 3/); assert.match(restoreJournalSource, /createObjectStore\('restore_journal'/); assert.match(restoreJournalSource, /async saveRestoreJournal\(journal\)/); assert.match(restoreJournalSource, /async getRestoreJournal\(\)/); assert.match(restoreJournalSource, /async clearRestoreJournal\(restoreId\)/);
assert.match(backupSource, /saveRestoreJournal\(\{ id: 'current', restoreId, state: 'APPLYING', backup \}\)/, 'The full validated import is durable before either canonical store is mutated.'); assert.match(backupSource, /export const recoverPendingRestore = async/); assert.match(backupSource, /if \(activeRestoreAttempt\) return Promise\.reject/, 'Concurrent restores cannot overwrite each other’s durable journal.'); assert.match(backupSource, /Backup restore is blocked while a canonical reset is pending/); assert.match(backupSource, /Data reset is blocked while a backup restore is running/); assert.match(backupSource, /await recoverPendingRestore\(\)/, 'Reset resolves any interrupted restore before creating its checkpoint.'); assert.match(backupSource, /await backupRepository\.clearRestoreJournal\(journal\.restoreId\)/, 'The restore journal clears only after both-store merge and a merged checkpoint.'); assert.match(fs.readFileSync('src/application/startup/startupService.js', 'utf8'), /recoverPendingReset\(\)[\s\S]*recoverPendingRestore\(\)[\s\S]*recoverStaleSyncing\(\)/, 'Interrupted restore recovery runs before mutation replay.');
const competingActiveShift = mergeCanonicalBackupSnapshot(
  { shifts: [{ id: 'shift-live', status: 'ACTIVE' }], audit_history: [] },
  { shifts: [{ id: 'shift-from-old-backup', status: 'ACTIVE' }], audit_history: [] },
  { sourceExportedAt: valid.exportedAt },
)
assert.deepEqual(competingActiveShift.snapshot.shifts.map(record => record.id), ['shift-live'], 'Restore must not create a second active shift under a different ID.')
assert.equal(competingActiveShift.conflicts, 1)
assert.ok(competingActiveShift.snapshot.audit_history.some(record => record.action === 'RESTORE_CONFLICT_ARCHIVE' && record.entityId === 'shift-from-old-backup'), 'The skipped active shift must remain recoverable as a conflict archive.')

console.log('Backup contract: PASS')
