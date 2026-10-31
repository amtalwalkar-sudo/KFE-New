import { CANONICAL_DB_VERSION } from '../constants/canonicalDatabase.js'
import assert from 'node:assert/strict'
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, CANONICAL_BACKUP_STORES, BackupService } from '../application/backup/backupService.js'
import { mergeCanonicalBackupSnapshot } from '../repositories/backupRepository.js'
const stores = Object.fromEntries(CANONICAL_BACKUP_STORES.map(store => [store, []]))
const snapshot = { format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 13 }, exportedAt: '2026-09-17T00:00:00.000Z', stores }
const backupPanel = await (await import('node:fs/promises')).readFile(new URL('../components/admin/BackupRestorePanel.vue', import.meta.url), 'utf8')
assert.match(backupPanel, /Create a JSON backup file you can keep on your phone or move elsewhere\./)
assert.match(backupPanel, /separate private recovery copy inside the app/)
assert.match(backupPanel, /KFE private recovery copy/)
assert.equal(typeof BackupService.createBackup, 'function'); assert.equal(typeof BackupService.serializeBackup, 'function'); assert.equal(typeof BackupService.readBackupText, 'function'); assert.equal(typeof BackupService.saveLocalBackup, 'function'); assert.equal(typeof BackupService.getLocalBackup, 'function'); assert.equal(typeof BackupService.restoreBackup, 'function'); assert.equal(typeof BackupService.requestLocalBackupCheckpoint, 'function'); assert.equal(typeof BackupService.maybeDailyLocalBackup, 'function')
assert.equal(CANONICAL_BACKUP_STORES.length, 22); assert.equal(CANONICAL_BACKUP_STORES.includes('driver_collected_data'), false); assert.equal(CANONICAL_BACKUP_STORES.includes('locality_labels'), true)
const record = structuredClone(snapshot); record.stores.trips = [{ id: 'trip-1', fare: 327, distanceKm: 18.4 }]
const serialized = BackupService.serializeBackup(record); assert.deepEqual(BackupService.readBackupText(serialized), record); assert.equal(BackupService.getBackupSummary(record).totalRecords, 1)
const PRE_FA4_BACKUP_STORES = ['shifts','fuel_logs','odoGaps','pending_mutations','days','trips','gps_snapshots','movement_artifacts','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','audit_history']
const legacyV1Stores = Object.fromEntries([...PRE_FA4_BACKUP_STORES.filter(store => store !== 'audit_history').slice(0, 11).map(store => [store, []]), ['driver_collected_data', []], ...PRE_FA4_BACKUP_STORES.filter(store => store !== 'audit_history').slice(11).map(store => [store, []])])
const legacyV1 = { format: BACKUP_FORMAT, formatVersion: 1, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 8 }, exportedAt: snapshot.exportedAt, stores: legacyV1Stores }
const migratedV1 = BackupService.validateBackup(legacyV1); assert.equal(migratedV1.formatVersion, BACKUP_FORMAT_VERSION); assert.equal(migratedV1.source.dbVersion, CANONICAL_DB_VERSION); assert.equal('driver_collected_data' in migratedV1.stores, false); assert.deepEqual(migratedV1.stores.audit_history, [])
const legacyV2Stores = Object.fromEntries([...PRE_FA4_BACKUP_STORES.map(store => [store, []]), ['driver_collected_data', []]])
const legacyV2 = { format: BACKUP_FORMAT, formatVersion: 2, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 9 }, exportedAt: snapshot.exportedAt, stores: legacyV2Stores }
const migratedV2 = BackupService.validateBackup(legacyV2); assert.equal(migratedV2.formatVersion, BACKUP_FORMAT_VERSION); assert.equal(migratedV2.source.dbVersion, CANONICAL_DB_VERSION); assert.equal('driver_collected_data' in migratedV2.stores, false)
const malformed = structuredClone(record); malformed.stores.trips = [{ id: 'trip-1' }, { id: 'trip-1' }]; assert.throws(() => BackupService.validateBackup(malformed), /duplicate id/); assert.throws(() => BackupService.validateBackup('{not-json'), /not valid JSON/); assert.throws(() => BackupService.validateBackup({ ...record, source: { dbName: 'other', dbVersion: 12 } }), /source does not match/); assert.throws(() => BackupService.validateBackup({ ...record, stores: { ...record.stores, unexpected: [] } }), /store set does not exactly match/)
const current = Object.fromEntries(CANONICAL_BACKUP_STORES.map(store => [store, []]))
current.shifts = [{ id: 'shift-today', status: 'ACTIVE', startOdometer: 41250 }]
current.trips = [
  { id: 'trip-identical', fare: 100, status: 'COMPLETED' },
  { id: 'trip-conflict', fare: 200, status: 'COMPLETED' },
]
const incoming = Object.fromEntries(CANONICAL_BACKUP_STORES.map(store => [store, []]))
incoming.shifts = [{ id: 'shift-yesterday', status: 'COMPLETED', startOdometer: 41000 }]
incoming.trips = [
  { id: 'trip-identical', fare: 100, status: 'COMPLETED' },
  { id: 'trip-conflict', fare: 999, status: 'COMPLETED' },
  { id: 'trip-yesterday', fare: 75, status: 'COMPLETED' },
]
const merged = mergeCanonicalBackupSnapshot(current, incoming, { sourceExportedAt: snapshot.exportedAt })
assert.equal(merged.snapshot.shifts.length, 2, 'Restore must preserve current shifts and add historical shifts instead of replacing today\'s data')
assert.ok(merged.snapshot.shifts.some(item => item.id === 'shift-today'), 'Restore must retain the current active shift')
assert.ok(merged.snapshot.trips.some(item => item.id === 'trip-yesterday'), 'Restore must add unique historical trips')
assert.equal(merged.snapshot.trips.find(item => item.id === 'trip-conflict').fare, 200, 'Restore must keep the current value for a conflicting canonical ID')
assert.equal(merged.duplicates, 1, 'Restore must deduplicate identical records')
assert.equal(merged.conflicts, 1, 'Restore must count same-ID payload conflicts')
assert.equal(merged.archivedConflicts, 1, 'Restore must archive a conflicting imported payload')
assert.ok(merged.snapshot.audit_history.some(item => item.action === 'RESTORE_CONFLICT_ARCHIVE' && item.entityId === 'trip-conflict' && item.payload.fare === 999), 'Restore must retain the conflicting imported payload in audit history')
const repeatedMerge = mergeCanonicalBackupSnapshot(merged.snapshot, incoming, { sourceExportedAt: snapshot.exportedAt })
assert.equal(repeatedMerge.snapshot.trips.length, merged.snapshot.trips.length, 'Repeating the same restore must not duplicate historical trips')
assert.equal(repeatedMerge.snapshot.audit_history.length, merged.snapshot.audit_history.length, 'Repeating the same restore must not duplicate conflict archives')
console.log('Phase 8 Backup & Restore contract: PASS')
