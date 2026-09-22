import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { istDateKey } from '../domain/time/ist.js'
import { normalizeCalculationSnapshot } from '../application/performance/normalizeCalculationSnapshot.js'
import { normalizeShiftInput, normalizeTripInput, normalizeFuelInput } from '../domain/canonicalNormalization.js'
import { normalizeFormValues, validateAdminForm } from '../application/admin/universalFormRules.js'
import { getAdminFormDefinition, ADMIN_FORM_KEYS } from '../application/admin/adminFormDefinitions.js'
import { CANONICAL_BACKUP_STORES, BACKUP_FORMAT_VERSION, validateBackup } from '../application/backup/backupService.js'
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8')
const indexedDBSource = read('src/utils/indexedDB.js')
const adminSource = read('src/repositories/adminRepository.js')
const shiftTripSource = read('src/repositories/shiftTripRepository.js')
const fuelSource = read('src/repositories/fuelRepository.js')
const mutationSource = read('src/repositories/mutationRepository.js')
const normalizationSource = read('src/domain/canonicalNormalization.js')
const formRulesSource = read('src/application/admin/universalFormRules.js')
const breakEvenSource = read('src/domain/performance/authoritativeBreakEven.js')
const targetSource = read('src/domain/performance/driverTargetStabilization.js')
const financeAdapterSource = read('src/domain/performance/financePerformanceAdapter.js')
const backupSource = read('src/application/backup/backupService.js')
const canonicalDoc = read('docs/KFE-CANONICAL-DATA-CONTRACT.md')
assert.match(adminSource, /existing\?\.id \|\| generateUUID\(\)/)
assert.match(shiftTripSource, /normalized\.id \|\| generateUUID\(\)/)
assert.match(fuelSource, /normalized\.id \|\| generateUUID\(\)/)
assert.match(mutationSource, /id: generateUUID\(\)/)
assert.equal(istDateKey(new Date('2026-09-10T17:59:59Z')), '2026-09-10')
assert.equal(istDateKey(new Date('2026-09-10T18:30:00Z')), '2026-09-11')
assert.equal(istDateKey('2026-09-10'), '2026-09-10')
assert.match(canonicalDoc, /Business calendar dates.*IST dates/)
assert.match(canonicalDoc, /must not be compared by passing UTC-midnight conversions/)
assert.match(breakEvenSource, /istDateKey/)
assert.match(targetSource, /effectiveDateKey = x => keyOf\(x\?\.effectiveFrom/)
const normalized = normalizeCalculationSnapshot({
  shifts: [{ id: 's1', start_odometer: '1000', end_odometer: '1200', shift_start_at: '2026-09-10T08:00:00+05:30', shift_end_at: '2026-09-10T18:00:00+05:30' }],
  trips: [{ id: 't1', trip_start_at: '2026-09-10T09:00:00+05:30', trip_end_at: '2026-09-10T10:00:00+05:30', trip_km: '18.4', fare: '327', status: 'COMPLETED', tripKmAuthority: 'OCR', revenueAuthority: 'OCR', tripKmProvenance: 'OCR', revenueProvenance: 'OCR' }],
  fuelLogs: [{ id: 'f1', created_at: '2026-09-10T18:00:00+05:30', total_cost: '820', kg: '10', provenance: 'MANUAL' }],
  maintenance: [{ id: 'm1', date: '2026-09-10', amount: '300' }],
  loans: [{ id: 'l1', principal: '550000', annual_rate_percent: '10', tenureYears: 5, start_date: '2026-04-09', status: 'ACTIVE' }],
  driverTargets: [{ id: 'dt1', effective_from: '2026-09-01', desiredProfit: '1000', active: true }],
  breakEvenInputs: [{ id: 'be1', effective_from: '2026-09-01', maintenance_provision_per_km: '2' }],
})
assert.equal(normalized.shifts[0].startOdometer, 1000)
assert.equal(normalized.shifts[0].endOdometer, 1200)
assert.equal(normalized.trips[0].tripKm, 18.4)
assert.equal(normalized.trips[0].revenue, 327)
assert.equal(normalized.fuelLogs[0].amount, 820)
assert.equal(normalized.fuelLogs[0].quantityKg, 10)
assert.equal(normalized.loans[0].principal, 550000)
assert.equal(normalized.loans[0].annualInterestRatePercent, 10)
assert.equal(normalized.loans[0].tenureMonths, 60)
assert.equal(normalized.driverTargets[0].desiredDriverProfit, 1000)
assert.equal(normalized.breakEvenInputs[0].maintenanceProvisionPerKm, 2)
assert.equal(normalized.trips[0].tripKmProvenance, 'OCR')
assert.equal(normalized.trips[0].revenueProvenance, 'OCR')
assert.equal(normalized.fuelLogs[0].provenance, 'MANUAL')
assert.equal('trip_start_at' in normalized.trips[0], false)
assert.equal('fare' in normalized.trips[0], false)
assert.equal('tenureYears' in normalized.loans[0], false)
assert.equal(normalizeCalculationSnapshot({ trips: [{ trip_km: 'not-a-number' }] }).trips.length, 0)
const shiftNormalized = normalizeShiftInput({ start_odometer: '1000', end_odometer: '1200', toll_cost: '50' })
const tripNormalized = normalizeTripInput({ shiftId: 's1', trip_km: '18.4', fare: '327' })
const fuelNormalized = normalizeFuelInput({ odometer_km: '1200', total_cost: '820', kg: '10', created_at: '2026-09-10T18:00:00+05:30' })
assert.equal(shiftNormalized.startOdometer, 1000); assert.equal(shiftNormalized.endOdometer, 1200); assert.equal(shiftNormalized.toll, 50)
assert.equal(tripNormalized.tripKm, 18.4); assert.equal(tripNormalized.revenue, 327); assert.equal(fuelNormalized.odometer, 1200); assert.equal(fuelNormalized.amount, 820); assert.equal(fuelNormalized.quantityKg, 10); assert.equal(fuelNormalized.capturedAt, '2026-09-10T18:00:00+05:30')
assert.match(normalizationSource, /normalizeShiftInput/); assert.match(normalizationSource, /normalizeTripInput/); assert.match(normalizationSource, /normalizeFuelInput/)
for (const formKey of ADMIN_FORM_KEYS) { const definition = getAdminFormDefinition(formKey); assert.ok(definition, `${formKey} must have a canonical form definition`); const values = Object.fromEntries((definition.fields ?? []).map(field => [field.key, field.defaultValue])); const normalizedValues = normalizeFormValues(definition, values); assert.deepEqual(Object.keys(normalizedValues).sort(), (definition.fields ?? []).map(field => field.key).sort(), `${formKey} normalization must cover every canonical field`) }
assert.ok(!ADMIN_FORM_KEYS.includes('driverCollectedData')); assert.match(formRulesSource, /normalizeFormValues/); assert.match(formRulesSource, /numbersMustBeFinite:true/)
const vehicleDefinition = getAdminFormDefinition('vehicle'); const vehicleNormalized = normalizeFormValues(vehicleDefinition, { registrationNumber: ' X ', make: 'A', model: 'B', acquiredOn: '2026-04-09', openingOdometerKm: '65000', fuelType: 'CNG', status: 'Active' }); assert.equal(vehicleNormalized.registrationNumber, 'X'); assert.equal(vehicleNormalized.openingOdometerKm, 65000); assert.equal(validateAdminForm(vehicleDefinition, vehicleNormalized).valid, true)
assert.match(adminSource, /validateAdminForm\(definition, values\)/); assert.match(adminSource, /validateRelationships\(db, formKey, values\)/); assert.match(adminSource, /relationshipStore/); assert.doesNotMatch(adminSource, /driverCollectedData|driver_collected_data/)
assert.match(shiftTripSource, /trip\.tripKmAuthority = 'MANUAL'/); assert.match(shiftTripSource, /trip\.revenueAuthority = 'SUPPORTING_ONLY'/); assert.match(shiftTripSource, /tripKmProvenance: normalized\.tripKmProvenance \?\? null/); assert.match(shiftTripSource, /revenueProvenance: normalized\.revenueProvenance \?\? null/); assert.match(fuelSource, /provenance: normalized\.provenance \?\? null/)
assert.match(canonicalDoc, /Provenance records where a value came from/); assert.match(canonicalDoc, /Authority is separate from provenance/); assert.match(shiftTripSource, /status !== 'ACTIVE'/); assert.match(shiftTripSource, /status = status/); assert.match(adminSource, /record\.deletedAt = now/); assert.match(adminSource, /record\.deleted = true/); assert.doesNotMatch(adminSource, /objectStore\([^)]*\)\.delete\(id\)/); assert.doesNotMatch(shiftTripSource, /objectStore\([^)]*\)\.delete\(id\)/); assert.doesNotMatch(fuelSource, /objectStore\([^)]*\)\.delete\(id\)/)
assert.match(canonicalDoc, /Operational status transitions are never implemented as deletion/); assert.match(canonicalDoc, /Hard deletion of canonical business records requires a separately governed data-destruction contract/); assert.match(shiftTripSource, /shiftId is required for a Trip/); assert.match(shiftTripSource, /endOdometer cannot be less than startOdometer/); assert.match(fuelSource, /must be a finite number/)
assert.match(shiftTripSource, /shift\.revenue = Number\(normalized\.revenue \|\| 0\)/); assert.match(shiftTripSource, /revenueAuthority = 'SUPPORTING_ONLY'/); assert.match(financeAdapterSource, /annualInterestRatePercent/); assert.doesNotMatch(financeAdapterSource, /annualInterestRate\s*:\s*10/); assert.match(financeAdapterSource, /const status = String\(loan\.status \|\| ''\)\.toUpperCase\(\)/); assert.match(adminSource, /LOAN_CONTRACT_FIELDS/); assert.match(adminSource, /AdminRepository\.correctLoan|correctLoan\(/); assert.match(adminSource, /action: 'CORRECTION'/)
const requiredStores = ['shifts', 'trips', 'fuel_logs', 'vehicles', 'drivers', 'compliance_records', 'maintenance_records', 'loans', 'loan_payments', 'prepayments', 'driver_targets', 'break_even_inputs', 'settings', 'pending_mutations', 'audit_history']; for (const store of requiredStores) assert.match(indexedDBSource, new RegExp(`['\"]${store}['\"]`), `${store} must remain a canonical store`)
assert.doesNotMatch(indexedDBSource, /createSimpleStore\(db, 'driver_collected_data'/); assert.match(indexedDBSource, /deleteObjectStore\('driver_collected_data'\)/); assert.equal(CANONICAL_BACKUP_STORES.includes('driver_collected_data'), false); assert.equal(BACKUP_FORMAT_VERSION, 4); assert.match(backupSource, /formatVersion === 2/); assert.match(backupSource, /driver_collected_data: _removed/); assert.match(canonicalDoc, /`driver_collected_data` is not part of the current canonical model/); assert.match(canonicalDoc, /database migration from version 9 to version 10 explicitly removes the obsolete store/); assert.match(backupSource, /Backup format version 4/)
const PRE_FA4_BACKUP_STORES = ['shifts','fuel_logs','odoGaps','pending_mutations','days','trips','gps_snapshots','movement_artifacts','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','audit_history']; const legacyV2Stores = Object.fromEntries([...PRE_FA4_BACKUP_STORES.map(store => [store, []]), ['driver_collected_data', []]]); const migratedBackup = validateBackup({ format: 'KFE_BACKUP', formatVersion: 2, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 9 }, exportedAt: new Date().toISOString(), stores: legacyV2Stores }); assert.equal(migratedBackup.formatVersion, 4); assert.equal('driver_collected_data' in migratedBackup.stores, false)
for (const store of ['days', 'odoGaps', 'gps_snapshots', 'movement_artifacts']) assert.match(indexedDBSource, new RegExp(`['\"]${store}['\"]`), `${store} must remain explicitly represented`)
assert.match(canonicalDoc, /supporting\/detail data only/i); assert.match(canonicalDoc, /historical references/i); assert.match(breakEvenSource, /istDateKey/); assert.match(targetSource, /effectiveDateKey/); assert.match(canonicalDoc, /effective-dated authoritative/i); assert.match(adminSource, /notifyCanonicalDataChanged/); assert.match(shiftTripSource, /notifyCanonicalDataChanged/); assert.match(fuelSource, /notifyCanonicalDataChanged/); assert.match(canonicalDoc, /canonical-data-changed notification/)
console.log('Canonical data contract tests: PASS')
