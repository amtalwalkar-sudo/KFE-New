import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const store = read('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java')
const plugin = read('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkPlugin.java')
const bridge = read('src/infrastructure/android/nativeCanonicalWork.js')
const ports = read('src/application/work/workRuntimePorts.js')
const adapter = read('src/infrastructure/work/workRuntimeAdapter.js')
const activity = read('android/app/src/main/java/com/kanishka/pwa/MainActivity.java')

assert.match(store, /CREATE TABLE canonical_records/)
assert.match(store, /CREATE TABLE canonical_operations/)
assert.match(store, /CREATE TABLE canonical_audit/)
assert.match(store, /db\.beginTransaction\(\)/)
assert.match(store, /db\.setTransactionSuccessful\(\)/)
assert.match(store, /operation_id TEXT PRIMARY KEY/)
assert.match(store, /operationId was already used for a different command/)
assert.match(store, /db\.insertOrThrow\("canonical_audit"/)
assert.match(plugin, /@CapacitorPlugin\(name = "KfeCanonicalWork"\)/)
for (const method of ['putRecord', 'getRecord', 'listRecords', 'getOperation']) assert.match(plugin, new RegExp('public void ' + method + '\('))
for (const method of ['putRecord', 'getRecord', 'listRecords', 'getOperation']) assert.match(bridge, new RegExp('async ' + method + '\('))
assert.match(ports, /canonicalWork: \['putRecord', 'getRecord', 'listRecords', 'getOperation', 'isAvailable'\]/)
assert.match(adapter, /canonicalWork: NativeCanonicalWorkService/)
assert.match(activity, /registerPlugin\(KfeCanonicalWorkPlugin\.class\)/)
console.log('PASS: native canonical persistence boundary contract')
