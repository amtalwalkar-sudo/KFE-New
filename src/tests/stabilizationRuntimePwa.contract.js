import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

const db = read('utils/indexedDB.js')
const main = read('main.js')
const platform = read('infrastructure/startup/platformStartup.js')
const mutation = read('repositories/mutationRepository.js')
const backupRepository = read('repositories/backupRepository.js')
const backupService = read('application/backup/backupService.js')

assert.equal((main.match(/serviceWorker\.register\s*\(/g) || []).length, 0, 'main.js must not register the service worker')
assert.equal((platform.match(/serviceWorker\.register\s*\(/g) || []).length, 1, 'PlatformStartup must own the single service-worker registration')
assert.match(platform, /registration\.waiting\.postMessage\(\{ type: 'kfe:activate-update' \}\)/)
assert.match(platform, /registration\.update\(\)\.catch/)

assert.match(db, /CANONICAL_DB_NAME\s*=\s*'kanishka_kfe_canonical_db'/)
assert.match(db, /SYNTHETIC_DB_NAME\s*=\s*'kanishka_kfe_synthetic_db'/)
assert.match(db, /const getActiveSource = \(\) =>/)
assert.match(db, /const dbNameFor = source => source === 'synthetic' \? SYNTHETIC_DB_NAME : CANONICAL_DB_NAME/)
assert.match(db, /export const initializeActiveStorage = async \(\{ dataSource \} = \{\}\) => initializeDatabase\(dbNameFor\(dataSource \|\| getActiveSource\(\)\)\)/)
assert.match(db, /export const initializeCanonicalStorage = initializeActiveStorage/)
assert.match(db, /export const openCanonicalDB = \(\) => initializeCanonicalStorage\(\{ dataSource: 'canonical' \}\)/)

const odo = db.slice(db.indexOf('export const getLastOdometer'))
assert.match(odo, /initializeCanonicalStorage\(\)/)
assert.match(odo, /Number\.isFinite\(value\) && value >= 0 \? value : null/)
assert.doesNotMatch(odo, /Number\(completed\[0\]\.endOdometer\) \|\| 0/)

const writers = [
  'repositories/adminRepository.js',
  'repositories/fuelRepository.js',
  'repositories/odoGapRepository.js',
  'repositories/shiftTripRepository.js',
  'repositories/movementArtifactRepository.js',
  'repositories/locationRepository.js'
]
for (const relative of writers) {
  const source = read(relative)
  assert.match(source, /initializeCanonicalStorage\(\)/, relative + ' must use active-source storage')
  assert.match(source, /pending_mutations/)
  assert.match(source, /audit_history/)
}
assert.match(backupRepository, /import \{ openCanonicalDB \} from '..\/utils\/indexedDB\.js'/)
assert.doesNotMatch(backupRepository, /initializeCanonicalStorage\(/)
assert.match(backupRepository, /restoreCanonicalSnapshot\(snapshot\) \{[\\s\\S]*const db = await openCanonicalDB\(\)/)
assert.match(backupRepository, /resetCanonicalData\(\) \{[\\s\\S]*const db = await openCanonicalDB\(\)/)
assert.match(backupService, /source: \{ dbName: 'kanishka_kfe_canonical_db', dbVersion: 11 \}/)
assert.match(mutation, /canonical synchronization queue/)
assert.match(mutation, /these sync lifecycle methods intentionally operate on canonical storage only/)
assert.doesNotMatch(mutation, /initializeCanonicalStorage\(/)
for (const method of ['recoverStaleSyncing', 'getPending', 'updateStatus', 'remove']) {
  const start = mutation.indexOf('async ' + method)
  assert.ok(start >= 0, method + ' must exist')
  const next = mutation.indexOf('async ', start + 6)
  const body = mutation.slice(start, next > 0 ? next : mutation.length)
  assert.match(body, /openCanonicalDB\(\)/, method + ' must remain canonical-only')
}

console.log('Stabilization runtime/PWA/data-boundary contract: PASS')