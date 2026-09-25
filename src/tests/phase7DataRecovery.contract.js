import assert from 'node:assert/strict'
import fs from 'node:fs'

const backupService = fs.readFileSync('src/application/backup/backupService.js', 'utf8')
const backupRepository = fs.readFileSync('src/repositories/backupRepository.js', 'utf8')
const indexedDb = fs.readFileSync('src/utils/indexedDB.js', 'utf8')

assert.match(backupService, /export const createBackup = async/)
assert.match(backupService, /export const serializeBackup = backup => JSON\.stringify\(validateBackup\(backup\)/)
assert.match(backupService, /export const restoreBackup = async input => \{ const backup = validateBackup\(input\)/)
assert.match(backupService, /await backupRepository\.restoreCanonicalSnapshot\(backup\.stores\)/)
assert.match(backupService, /await saveLocalBackup\(backup\)/)
assert.match(backupService, /export const resetData = async \(\) => \{ await backupRepository\.resetCanonicalData\(\)/)
assert.match(backupService, /export const maybeDailyLocalBackup = async/)
assert.match(backupService, /Date\.now\(\) - Date\.parse\(current\.savedAt\) >= 24 \* 60 \* 60 \* 1000/)

assert.match(backupRepository, /openCanonicalDB\(\)/)
assert.doesNotMatch(backupRepository, /initializeActiveStorage\(/)
assert.match(backupRepository, /db\.transaction\(stores, 'readonly'\)/)
assert.match(backupRepository, /db\.transaction\(stores, 'readwrite'\)/)
assert.match(backupRepository, /for \(const storeName of stores\) \{ const store = tx\.objectStore\(storeName\)\n          store\.clear\(\)/)
assert.match(backupRepository, /store\.add\(structuredClone\(record\)\)/)
assert.match(backupRepository, /tx\.oncomplete = \(\) => \{ notifyCanonicalDataChanged/)
assert.match(backupRepository, /tx\.onabort = \(\) => reject/)

assert.match(indexedDb, /const CANONICAL_DB_NAME = 'kanishka_kfe_canonical_db'/)
assert.match(indexedDb, /const SYNTHETIC_DB_NAME = 'kanishka_kfe_synthetic_db'/)
assert.match(indexedDb, /export const openCanonicalDB = \(\) => initializeCanonicalStorage\(\{ dataSource: 'canonical' \}\)/)
assert.match(indexedDb, /export const setActiveDataSource = source =>/)
assert.match(indexedDb, /dbInstances\.clear\(\); initializationPromises\.clear\(\)/)

console.log('Phase 7 data/recovery gate contract: PASS')
