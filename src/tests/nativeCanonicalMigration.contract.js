import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const store = read('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java')
const plugin = read('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkPlugin.java')
const bridge = read('src/infrastructure/android/nativeCanonicalWork.js')
const migration = read('src/infrastructure/android/nativeCanonicalMigration.js')

assert.match(store, /CREATE TABLE canonical_migrations/)
assert.match(store, /CREATE TABLE canonical_migration_items/)
assert.match(store, /snapshot_hash TEXT NOT NULL/)
assert.match(store, /payload_hash TEXT NOT NULL/)
assert.match(store, /migrationId was already used with a different source snapshot/)
assert.match(store, /Migration conflict: native record differs/)
assert.match(store, /verifyLegacyMigration\(String migrationId\)/)
assert.match(store, /expectedPayloadHash\.equals\(sha256\(record\.getString\(0\)\)\)/)
assert.match(store, /DB_VERSION = 2/)
assert.match(store, /if \(oldVersion < 2\)/)
for (const method of ['migrateLegacySnapshot', 'verifyLegacyMigration', 'getMigration']) {
  assert.ok(plugin.includes('public void ' + method + '('), 'Missing native migration method: ' + method)
  assert.ok(bridge.includes('async ' + method + '('), 'Missing JS native migration method: ' + method)
}
for (const entity of ['SHIFT', 'TRIP', 'GPS_SNAPSHOT', 'MOVEMENT_ARTIFACT', 'PENDING_MUTATION', 'AUDIT_HISTORY', 'CANONICAL_OPERATION']) {
  assert.ok(migration.includes(`['${entity}'`), 'Missing migration entity: ' + entity)
}
assert.match(migration, /sourcePreserved: true/)
assert.match(migration, /cutoverPerformed: false/)
assert.match(migration, /if \(records\.some\(record => !record/)
assert.doesNotMatch(migration, /fuel_logs|FUEL|fuel form/i)
console.log('PASS: native canonical migration safety contract')
