import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const db = read('utils/indexedDB.js')
const backup = read('application/backup/backupService.js')
const backupRepo = read('repositories/backupRepository.js')
const mutation = read('repositories/mutationRepository.js')

assert(db.includes("const CANONICAL_DB_NAME = 'kanishka_kfe_canonical_db'"), 'Canonical DB name missing')
assert(db.includes("const SYNTHETIC_DB_NAME = 'kanishka_kfe_synthetic_db'"), 'Synthetic DB name missing')
assert(db.includes('const CANONICAL_DB_VERSION = 12'), 'Canonical schema version must be v12 after historical snapshots')
assert(db.includes('const SYNTHETIC_DB_VERSION = 11'), 'Synthetic schema version must be explicit')
assert(db.includes('const dbVersionFor = name =>'), 'DB version must be selected per physical DB')
assert(db.includes('indexedDB.open(name, dbVersionFor(name))'), 'All physical DBs must use their own explicit schema version')
assert(db.includes('request.onblocked'), 'Blocked IndexedDB upgrades must fail explicitly instead of hanging startup')
assert(db.includes('Close other KFE tabs and retry.'), 'Blocked upgrade error must be actionable')
assert(db.includes("source === 'synthetic' ? SYNTHETIC_DB_NAME : CANONICAL_DB_NAME"), 'Active source must map to a separate physical DB')
assert(db.includes("sessionStorage.getItem(DATA_SOURCE_KEY) === 'synthetic'"), 'Synthetic selection must be tab-local')
assert(db.includes("initializeDatabase(SYNTHETIC_DB_NAME)"), 'Synthetic storage initializer missing')
assert(db.includes("initializeCanonicalStorage({ dataSource: 'canonical' })"), 'Canonical-only initializer missing')
assert(db.includes('for (const db of dbInstances.values())'), 'Data-source switch must close cached DB connections')
assert(db.includes('dbInstances.clear(); initializationPromises.clear()'), 'Data-source switch must invalidate cached DB state')

assert(backup.includes("source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 12 }"), 'Backups must identify canonical source DB')
assert(backup.includes('CANONICAL_BACKUP_STORES'), 'Backup store allowlist missing')
assert(backup.includes("backup.source.dbName !== 'kanishka_kfe_canonical_db'"), 'Synthetic DB must never be accepted as a restore source')
assert(backup.includes('Backup store set does not exactly match'), 'Backup store allowlist must be exact')
assert(backup.includes('duplicate id'), 'Backup validation must reject duplicate IDs')
assert(backup.includes('driver_collected_data'), 'Legacy retired-store migration must be explicit')
assert(backupRepo.includes('openCanonicalDB'), 'Backup repository must open canonical storage explicitly')
assert(!backupRepo.includes('initializeCanonicalStorage()'), 'Backup repository must not depend on active synthetic/canonical mode')
assert(backupRepo.includes('structuredClone(record)'), 'Restore must clone records before inserting')
assert(backupRepo.includes('tx.oncomplete'), 'Restore must commit atomically')
assert(backupRepo.includes('tx.onabort'), 'Restore must reject aborted transactions')

assert(mutation.includes('openCanonicalDB'), 'Sync lifecycle must use canonical storage')
assert(mutation.includes("const tx = db.transaction('pending_mutations'"), 'Mutation lifecycle must be isolated to canonical sync queue')
assert(!mutation.includes('getActiveDataSource'), 'Sync lifecycle must not follow synthetic mode')

console.log('Phase 4 persistence, migration, backup and data-isolation contract: PASS')
