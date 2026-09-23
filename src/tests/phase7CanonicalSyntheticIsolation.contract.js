import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const db = read('src/utils/indexedDB.js')

for (const file of [
  'src/repositories/adminRepository.js',
  'src/repositories/performanceRepository.js',
  'src/repositories/fuelRepository.js',
  'src/repositories/shiftTripRepository.js',
  'src/repositories/locationRepository.js',
]) {
  const source = read(file)
  assert(source.includes('initializeActiveStorage'), file + ' must use active data-source storage')
  assert(!source.includes('initializeCanonicalStorage'), file + ' must not hard-wire canonical storage')
}
assert(db.includes("source === 'synthetic' ? SYNTHETIC_DB_NAME : CANONICAL_DB_NAME"))
assert(db.includes('setActiveDataSource'))
assert(db.includes('dbInstances.clear(); initializationPromises.clear()'))
assert(db.includes("sessionStorage.getItem(DATA_SOURCE_KEY) === 'synthetic'"))
assert(db.includes('initializeSyntheticStorage'))
assert(db.includes('openCanonicalDB'))
assert(read('src/repositories/mutationRepository.js').includes('openCanonicalDB'))
assert(read('src/repositories/backupRepository.js').includes('openCanonicalDB'))
assert(read('src/application/backup/backupService.js').includes("dbName: 'kanishka_kfe_canonical_db'"))

console.log('Phase 7 source-boundary isolation contract: PASS')
