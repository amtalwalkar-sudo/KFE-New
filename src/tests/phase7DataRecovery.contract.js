import assert from 'node:assert/strict'
import fs from 'node:fs'

const backupService = fs.readFileSync('src/application/backup/backupService.js', 'utf8')
const backupRepository = fs.readFileSync('src/repositories/backupRepository.js', 'utf8')
const indexedDb = fs.readFileSync('src/utils/indexedDB.js', 'utf8')
const startup = fs.readFileSync('src/application/startup/startupService.js', 'utf8')

assert.match(backupService, /export const createBackup = async/)
assert.match(backupService, /export const serializeBackup = backup => JSON\.stringify\(validateBackup\(backup\)/)
assert.match(backupService, /export const restoreBackup = async input => \{[\s\S]*const backup = validateBackup\(input\)/, 'Restore validates input before journaling and applying it.'); assert.match(backupService, /export const recoverPendingRestore = async/); assert.match(backupService, /saveRestoreJournal\(\{ id: 'current', restoreId, state: 'APPLYING', backup \}\)/, 'A durable restore journal precedes cross-store writes.')
assert.match(backupService, /await backupRepository\.restoreCanonicalSnapshot\(backup\.stores, \{ sourceExportedAt: backup\.exportedAt \}\)/, 'Restore must preserve source provenance while merging the backup with current records.')
assert.match(backupService, /saveLocalBackup\(await createBackup\(\)\)/, 'The post-restore checkpoint must include the merged current and imported records.')
assert.match(backupService, /await saveLocalBackup\(await createBackup\(\)\)/, 'The saved local recovery checkpoint must reflect the merged dataset.')
assert.match(backupService, /const runResetData = async \(\) => \{[\s\S]*await recoverPendingReset\(\)/, 'A new reset request must recover any previous reset before starting.')
assert.match(backupService, /await backupRepository\.resetCanonicalData\(\{ resetId \}\)/, 'The cross-store reset must use its durable reset ID.')
assert.match(startup, /await BackupService\.recoverPendingReset\(\)[\s\S]*await MutationRepository\.recoverStaleSyncing\(\)/, 'Startup must recover reset before replaying mutations.')
assert.match(backupService, /export const maybeDailyLocalBackup = async/)
assert.match(backupService, /Date\.now\(\) - Date\.parse\(current\.savedAt\) >= 24 \* 60 \* 60 \* 1000/)

assert.match(backupRepository, /openCanonicalDB\(\)/)
assert.doesNotMatch(backupRepository, /initializeActiveStorage\(/)
assert.match(backupRepository, /db\.transaction\(stores, 'readonly'\)/)
assert.match(backupRepository, /db\.transaction\(stores, 'readwrite'\)/)
assert.match(backupRepository, /async restoreCanonicalSnapshot\(snapshot, \{ sourceExportedAt = null \} = \{\}\) \{[\s\S]*db\.transaction\(stores, 'readwrite'\)/, 'Restore compares and merges within a single canonical read-write transaction.')
assert.doesNotMatch(backupRepository.slice(backupRepository.indexOf('async restoreCanonicalSnapshot'), backupRepository.indexOf('async resetCanonicalData')), /store\.clear\(/, 'Restore must not clear current canonical records.')
assert.match(backupRepository, /store\.add\(structuredClone\(record\)\)/)
assert.match(backupRepository, /tx\.oncomplete = \(\) => \{ notifyCanonicalDataChanged/)
assert.match(backupRepository, /tx\.onabort = \(\) => reject/)

assert.match(indexedDb, /const CANONICAL_DB_NAME = 'kanishka_kfe_canonical_db'/)
assert.match(indexedDb, /const SYNTHETIC_DB_NAME = 'kanishka_kfe_synthetic_db'/)
assert.match(indexedDb, /export const openCanonicalDB = \(\) => initializeCanonicalStorage\(\{ dataSource: 'canonical' \}\)/)
assert.match(indexedDb, /export const setActiveDataSource = source =>/)
assert.match(indexedDb, /dbInstances\.clear\(\); initializationPromises\.clear\(\)/)

console.log('Phase 7 data/recovery gate contract: PASS')
