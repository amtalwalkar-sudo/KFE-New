import assert from 'node:assert/strict'
import fs from 'node:fs'

const db = fs.readFileSync('src/utils/indexedDB.js', 'utf8')
const admin = fs.readFileSync('src/repositories/adminRepository.js', 'utf8')
const synthetic = fs.readFileSync('src/repositories/syntheticDataRepository.js', 'utf8')

assert.match(db, /const CANONICAL_DB_NAME = 'kanishka_kfe_canonical_db'/)
assert.match(db, /const SYNTHETIC_DB_NAME = 'kanishka_kfe_synthetic_db'/)
assert.match(db, /export const initializeActiveStorage = async/)
assert.match(db, /export const setActiveDataSource/)
assert.match(db, /dbInstances\.clear\(\); initializationPromises\.clear\(\)/)

assert.match(admin, /getActiveDataSource/)
assert.match(admin, /if \(getActiveDataSource\(\) === 'canonical'\) notifyCanonicalDataChanged/)
assert.doesNotMatch(admin, /tx\.oncomplete = \(\) => \{ notifyCanonicalDataChanged/)

assert.match(synthetic, /const SYNTHETIC_STORES = Object\.freeze\(\['settlements'/)
assert.match(synthetic, /const stores = \[\.\.\.new Set\(\[\.\.\.SYNTHETIC_STORES, \.\.\.Object\.keys\(snapshot\)\]\)\]/)
assert.match(synthetic, /setActiveDataSource\('canonical'\)/)

console.log('Phase 7 canonical ↔ synthetic isolation boundary contract: PASS')
