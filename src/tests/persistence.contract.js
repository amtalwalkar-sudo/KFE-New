import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const db = read('constants/canonicalDatabase.js') + '\n' + read('utils/indexedDB.js')
const admin = read('repositories/adminRepository.js')
const shiftTrip = read('repositories/shiftTripRepository.js')
const canonicalWorkRecords = read('domain/work/canonicalWorkRecords.js')
const fuel = read('repositories/fuelRepository.js')
const mutation = read('repositories/mutationRepository.js')
const contract = fs.readFileSync(path.join(root, '..', 'docs', 'KFE-PHASE-2-PERSISTENCE-CONTRACT.md'), 'utf8')

console.log('--- Running KFE Phase 2 Local-First Persistence Contract Tests ---')

assert(db.includes("const CANONICAL_DB_NAME = 'kanishka_kfe_canonical_db'"), 'Canonical local DB missing')
assert(/CANONICAL_DB_VERSION\s*=\s*\d+/.test(db), 'Versioned schema missing')
assert(db.includes('indexedDB.open(name, CANONICAL_DB_VERSION)'), 'Versioned canonical IndexedDB open missing')
assert(db.includes('onupgradeneeded'), 'Migration hook missing')
assert(db.includes('initializationPromise'), 'Initialization guard missing')
assert(db.includes('dbInstance.onversionchange'), 'Version-change lifecycle handling missing')
const version = Number(db.match(/CANONICAL_DB_VERSION\s*=\s*(\d+)/)?.[1])
assert(version === 19, 'Canonical DB must be version 19 with durable loan transaction history.')
assert(contract.includes('cloud service must not be required'), 'Local-first boundary missing')

const stores = ['canonical_operations','shifts','trips','fuel_logs','gps_snapshots','locality_labels','vehicles','drivers','compliance_records','maintenance_records','loans','loan_transactions','settings','pending_mutations','audit_history','form_drafts']
for (const store of stores) assert(db.includes(`'${store}'`), `Canonical store missing: ${store}`)
assert(!db.includes("createSimpleStore(db, 'driver_collected_data'"), 'Removed driver-collected store must not be recreated')
assert(db.includes('db.deleteObjectStore(retiredStore)'), 'Retired object stores must be dropped by the schema migration.')
for (const retired of ['driver_collected_data','admin_records','financial_inputs','odoGaps','days','movement_artifacts','loan_payments','prepayments','driver_targets','break_even_inputs','settlements','financial_period_snapshots']) assert(db.includes(`'${retired}'`), `Retired store migration missing: ${retired}`)
assert(!db.includes("deleteObjectStore('trips')"), 'Trip history must survive migration')
assert(!db.includes("deleteObjectStore('shifts')"), 'Shift history must survive migration')
assert(db.includes("const createSimpleStore = (db, name, indexes = [])"), 'Shared canonical store creation helper missing')
assert(db.includes("db.createObjectStore(name, { keyPath: 'id' })"), 'Shared canonical stores must use id key paths')
assert(admin.includes('existing?.id || generateUUID()'), 'Admin UUID contract missing')
assert(canonicalWorkRecords.includes('id: normalized.id || makeId()'), 'Shared Shift/Trip UUID contract missing')
assert(shiftTrip.includes('createCanonicalShiftRecord(data'), 'Shift repository must use shared canonical record factory')
assert(shiftTrip.includes('createCanonicalTripRecord(data'), 'Trip repository must use shared canonical record factory')
assert(fuel.includes('normalized.id || generateUUID()'), 'Fuel UUID contract missing')
assert(mutation.includes('id: generateUUID()'), 'Mutation UUID contract missing')

for (const index of ["createIndex('shiftEndAt'", "createIndex('createdAt'", "createIndex('status'", "createIndex('shiftId'", "createIndex('tripStartAt'"]) assert(db.includes(index), `Required persistence index missing: ${index}`)
for (const indexedStore of ['vehicles','drivers','compliance_records','maintenance_records','loans','settings','audit_history','canonical_operations','form_drafts']) assert(db.includes(`createSimpleStore(db, '${indexedStore}'`), `Shared indexed store definition missing: ${indexedStore}`)
assert(!db.includes("createObjectStore('financial_period_snapshots'"), 'Retired financial period snapshot store must not be recreated.')
assert(db.includes("trips.deleteIndex('dayId')"), 'Retired Trip day index must be removed during migration.')
for (const explicitStore of ['shifts','fuel_logs','pending_mutations','trips','gps_snapshots','locality_labels']) assert(db.includes(`!db.objectStoreNames.contains('${explicitStore}')`), `Upgrade path missing for explicit store: ${explicitStore}`)

for (const source of [admin, shiftTrip, fuel]) {
  assert(source.includes('pending_mutations'), 'Canonical write missing mutation coupling')
  assert(source.includes('audit_history'), 'Canonical write missing audit coupling')
  assert(source.includes("'readwrite'"), 'Canonical write missing readwrite transaction')
  assert(source.includes('tx.oncomplete'), 'Commit completion handling missing')
  assert(source.includes('tx.onerror'), 'Transaction error handling missing')
  assert(source.includes('tx.onabort'), 'Transaction abort handling missing')
}

const adminSaveBody = admin.slice(admin.indexOf('async save(formKey'), admin.indexOf('async remove('))
assert(adminSaveBody.includes('tx.oncomplete'), 'Admin source-form save acknowledgement must wait for the read-write transaction commit')
assert(adminSaveBody.includes('tx.onerror'), 'Admin source-form save must reject transaction errors')
assert(adminSaveBody.includes('tx.onabort'), 'Admin source-form save must reject aborted transactions')
assert(!/request\.onsuccess\s*=\s*\(\)\s*=>\s*resolve\(\)/.test(adminSaveBody), 'Admin source-form save must not acknowledge durability on request success before transaction completion')

assert(admin.includes('record.deletedAt = now'), 'Soft deletion timestamp missing')
assert(admin.includes('record.deleted = true'), 'Soft deletion marker missing')
assert(admin.includes('records.filter(record => !isDeleted(record)'), 'Active query must exclude deleted records')
assert(!/objectStore\([^)]*\)\.delete\(id\)/.test(admin), 'Admin must not hard-delete canonical records')
assert(!/objectStore\([^)]*\)\.delete\(id\)/.test(shiftTrip), 'Shift/Trip must not hard-delete operational records')
assert(!/objectStore\([^)]*\)\.delete\(id\)/.test(fuel), 'Fuel must not hard-delete operational records')

assert(mutation.includes('mutationVersion'), 'Mutation version missing')
assert(mutation.includes('retryCount'), 'Mutation retry metadata missing')
assert(mutation.includes("status: 'PENDING'"), 'New mutations must start pending')
assert(mutation.includes('structuredClone(payload)'), 'Mutation payload cloning missing')
assert(mutation.includes('buildAuditRecord'), 'Audit coupling missing')

for (const forbidden of ['supabase','firebase','@google/genai','google drive']) assert(!db.toLowerCase().includes(forbidden), `Local DB provider coupling found: ${forbidden}`)
assert(contract.includes('Remote synchronization and multi-device live data sync are not part of the current product scope'), 'Remote synchronization must remain out of scope')
assert(contract.includes('Dropbox is retained only as an optional backup provider while KFE is open and online'), 'Dropbox must remain an optional foreground backup provider without becoming a canonical data dependency.')

console.log('✅ Phase 2 Local-First Persistence Contract Tests Passed Successfully!')
