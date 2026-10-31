import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { istDateKey } from '../domain/time/ist.js'
import { normalizeShiftInput, normalizeTripInput, normalizeFuelInput } from '../domain/canonicalNormalization.js'
import { normalizeFormValues, validateAdminForm } from '../application/admin/universalFormRules.js'
import { getAdminFormDefinition, ADMIN_FORM_KEYS } from '../application/admin/adminFormDefinitions.js'
import { CANONICAL_BACKUP_STORES, BACKUP_FORMAT_VERSION, validateBackup } from '../application/backup/backupService.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const indexedDB = read('src/utils/indexedDB.js')
const adminRepo = read('src/repositories/adminRepository.js')
const shiftTripRepo = read('src/repositories/shiftTripRepository.js')
const fuelRepo = read('src/repositories/fuelRepository.js')
const canonicalRecords = read('src/domain/work/canonicalWorkRecords.js')
const normalization = read('src/domain/canonicalNormalization.js')
const formRules = read('src/application/admin/universalFormRules.js')
const backupSource = read('src/application/backup/backupService.js')
const dataContract = read('docs/KFE-CANONICAL-DATA-CONTRACT.md')

assert.equal(istDateKey(new Date('2026-09-10T17:59:59Z')), '2026-09-10')
assert.equal(istDateKey(new Date('2026-09-10T18:30:00Z')), '2026-09-11')
assert.equal(istDateKey('2026-09-10'), '2026-09-10')

const shift = normalizeShiftInput({ start_odometer: '1000', end_odometer: '1200', toll_cost: '50' })
const trip = normalizeTripInput({ shiftId: 's1', fare: '327' })
const fuel = normalizeFuelInput({ odometer_km: '1200', total_cost: '820', kg: '10', created_at: '2026-09-10T18:00:00+05:30' })
assert.equal(shift.startOdometer, 1000); assert.equal(shift.endOdometer, 1200); assert.equal(shift.toll, 50)
assert.equal(trip.tripKm, undefined); assert.equal(trip.revenue, 327)
assert.equal(fuel.odometer, 1200); assert.equal(fuel.amount, 820); assert.equal(fuel.quantityKg, 10); assert.equal(fuel.capturedAt, '2026-09-10T18:00:00+05:30')
assert.match(normalization, /normalizeShiftInput/); assert.match(normalization, /normalizeTripInput/); assert.match(normalization, /normalizeFuelInput/)

assert.deepEqual(ADMIN_FORM_KEYS, ['businessSetup','vehicle','driver','compliance','maintenance','loan'])
for (const key of ADMIN_FORM_KEYS) {
  const definition = getAdminFormDefinition(key)
  assert.ok(definition?.fields?.length, `${key} must retain its basic source form`)
  const values = Object.fromEntries(definition.fields.map(field => [field.key, field.defaultValue]))
  assert.deepEqual(Object.keys(normalizeFormValues(definition, values)).sort(), definition.fields.map(field => field.key).sort())
}
const vehicleDefinition = getAdminFormDefinition('vehicle')
const vehicle = normalizeFormValues(vehicleDefinition, { registrationNumber: ' X ', make: 'A', model: 'B', acquiredOn: '2026-04-09', openingOdometerKm: '65000', fuelType: 'CNG', status: 'Active' })
assert.equal(vehicle.registrationNumber, 'X'); assert.equal(vehicle.openingOdometerKm, 65000)
assert.equal(validateAdminForm(vehicleDefinition, vehicle).valid, true)
assert.match(formRules, /normalizeFormValues/); assert.match(formRules, /numbersMustBeFinite:true/)

assert.match(adminRepo, /existing\?\.id \|\| generateUUID\(\)/)
assert.match(adminRepo, /record\.deletedAt = now/); assert.match(adminRepo, /record\.deleted = true/)
assert.match(shiftTripRepo, /createCanonicalShiftRecord\(data/); assert.match(shiftTripRepo, /createCanonicalTripRecord\(data/)
assert.match(shiftTripRepo.slice(shiftTripRepo.indexOf('async completeShift(data)'), shiftTripRepo.indexOf('async createTrip(data)')), /shift\.revenue\s*=\s*deriveLiveRevenue\(shiftTrips\)/)
assert.match(fuelRepo, /normalized\.id \|\| generateUUID\(\)/)
assert.match(canonicalRecords, /shiftId is required for a Trip/)

for (const store of ['shifts','trips','fuel_logs','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','pending_mutations','audit_history']) {
  assert.match(indexedDB, new RegExp(`['\\\"]${store}['\\\"]`), `${store} must remain available to preserve saved records`)
}
assert.doesNotMatch(indexedDB, /createSimpleStore\(db, 'driver_collected_data'/)
assert.match(indexedDB, /deleteObjectStore\('driver_collected_data'\)/)
assert.equal(CANONICAL_BACKUP_STORES.includes('driver_collected_data'), false)
assert.equal(BACKUP_FORMAT_VERSION, 5)
assert.match(backupSource, /backup\.formatVersion < BACKUP_FORMAT_VERSION/)
assert.match(backupSource, /driver_collected_data: _removed/)
assert.match(dataContract, /Preserve those records during scope cleanup and backup\/restore/)
assert.match(dataContract, /Hard deletion of canonical business records requires an explicit data-destruction action/)
assert.doesNotMatch(dataContract, /deriveAuthoritativeBreakEven|Driver Target domain owns|monthly break-even result/)

const legacyStores = ['shifts','fuel_logs','odoGaps','pending_mutations','days','trips','gps_snapshots','movement_artifacts','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','audit_history']
const stores = Object.fromEntries([...legacyStores.map(store => [store, []]), ['driver_collected_data', []]])
const migrated = validateBackup({ format: 'KFE_BACKUP', formatVersion: 2, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 9 }, exportedAt: new Date().toISOString(), stores })
assert.equal(migrated.formatVersion, 5); assert.equal('driver_collected_data' in migrated.stores, false)
for (const store of ['days','odoGaps','gps_snapshots','movement_artifacts']) assert.match(indexedDB, new RegExp(`['\\\"]${store}['\\\"]`))
console.log('Canonical data contract: core facts normalized; legacy saved records preserved without retired calculation models.')
