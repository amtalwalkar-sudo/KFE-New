import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const db = read('utils/indexedDB.js')
const admin = read('repositories/adminRepository.js')
const shiftTrip = read('repositories/shiftTripRepository.js')
const fuel = read('repositories/fuelRepository.js')
const odo = read('repositories/odoGapRepository.js')
const mutation = read('repositories/mutationRepository.js')
const contract = fs.readFileSync(path.join(root, '..', 'docs', 'KFE-PHASE-2-PERSISTENCE-CONTRACT.md'), 'utf8')

console.log('--- Running KFE Phase 2 Local-First Persistence Contract Tests ---')

assert(db.includes("const CANONICAL_DB_NAME = 'kanishka_kfe_canonical_db'"), 'Canonical local DB missing')
assert(/CANONICAL_DB_VERSION\s*=\s*\d+/.test(db), 'Versioned schema missing')
assert(db.includes('indexedDB.open(name, dbVersionFor(name))'), 'Versioned IndexedDB open missing')
assert(db.includes('onupgradeneeded'), 'Migration hook missing')
assert(db.includes('initializationPromise'), 'Initialization guard missing')
assert(db.includes('dbInstance.onversionchange'), 'Version-change lifecycle handling missing')
const version = Number(db.match(/CANONICAL_DB_VERSION\s*=\s*(\d+)/)?.[1])
assert(version === 13, 'Canonical DB must be version 13 after historical period snapshot migration')
assert(contract.includes('cloud service must not be required'), 'Local-first boundary missing')

const stores = ['financial_period_snapshots','shifts','trips','fuel_logs','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','pending_mutations','audit_history']
for (const store of stores) assert(db.includes(`'${store}'`), `Canonical store missing: ${store}`)
assert(!db.includes("createSimpleStore(db, 'driver_collected_data'"), 'Removed driver-collected store must not be recreated')
assert(db.includes("deleteObjectStore('driver_collected_data')"), 'Removed driver-collected store migration missing')
assert(db.includes("deleteObjectStore('admin_records')"), 'Retired admin store migration missing')
assert(db.includes("deleteObjectStore('financial_inputs')"), 'Retired financial store migration missing')
assert(!db.includes("deleteObjectStore('trips')"), 'Trip history must survive migration')
assert(!db.includes("deleteObjectStore('shifts')"), 'Shift history must survive migration')
assert(db.includes("const createSimpleStore = (db, name, indexes = [])"), 'Shared canonical store creation helper missing')
assert(db.includes("db.createObjectStore(name, { keyPath: 'id' })"), 'Shared canonical stores must use id key paths')
assert(admin.includes('existing?.id || generateUUID()'), 'Admin UUID contract missing')
assert(shiftTrip.includes('normalized.id || generateUUID()'), 'Shift/Trip UUID contract missing')
assert(fuel.includes('normalized.id || generateUUID()'), 'Fuel UUID contract missing')
assert(mutation.includes('id: generateUUID()'), 'Mutation UUID contract missing')

for (const index of ["createIndex('shiftEndAt'", "createIndex('createdAt'", "createIndex('status'", "createIndex('shiftId'", "createIndex('tripStartAt'"]) assert(db.includes(index), `Required persistence index missing: ${index}`)
for (const indexedStore of ['vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','audit_history']) assert(db.includes(`createSimpleStore(db, '${indexedStore}'`), `Shared indexed store definition missing: ${indexedStore}`)
assert(db.includes("createObjectStore('financial_period_snapshots', { keyPath: 'periodKey' })"), 'Historical period snapshot store must use periodKey key paths')
for (const explicitStore of ['shifts','fuel_logs','odoGaps','pending_mutations','days','trips','gps_snapshots']) assert(db.includes(`!db.objectStoreNames.contains('${explicitStore}')`), `Upgrade path missing for explicit store: ${explicitStore}`)

for (const source of [admin, shiftTrip, fuel, odo]) {
  assert(source.includes('pending_mutations'), 'Canonical write missing mutation coupling')
  assert(source.includes('audit_history'), 'Canonical write missing audit coupling')
  assert(source.includes("'readwrite'"), 'Canonical write missing readwrite transaction')
  assert(source.includes('tx.oncomplete'), 'Commit completion handling missing')
  assert(source.includes('tx.onerror'), 'Transaction error handling missing')
  assert(source.includes('tx.onabort'), 'Transaction abort handling missing')
}

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
assert(contract.includes('Cloud backup and multi-device synchronization are later phases'), 'Cloud/sync must remain later-phase work')

console.log('✅ Phase 2 Local-First Persistence Contract Tests Passed Successfully!')
