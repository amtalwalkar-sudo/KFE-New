import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { istDateKey } from '../domain/time/ist.js'
import { normalizeCalculationSnapshot } from '../application/performance/normalizeCalculationSnapshot.js'
import { normalizeShiftInput, normalizeTripInput, normalizeFuelInput } from '../domain/canonicalNormalization.js'
import { normalizeFormValues, validateAdminForm } from '../application/admin/universalFormRules.js'
import { getAdminFormDefinition, ADMIN_FORM_KEYS } from '../application/admin/adminFormDefinitions.js'

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
const authorityDoc = read('docs/CALCULATION-AUTHORITY-MATRIX.md')
const canonicalDoc = read('docs/KFE-CANONICAL-DATA-CONTRACT.md')

// Identity: canonical persistence uses stable client-generated UUIDs.
assert.match(adminSource, /existing\?\.id \|\| generateUUID\(\)/)
assert.match(shiftTripSource, /normalized\.id \|\| generateUUID\(\)/)
assert.match(fuelSource, /normalized\.id \|\| generateUUID\(\)/)
assert.match(mutationSource, /id: generateUUID\(\)/)

// IST boundary: true instants and business dates are distinct; date-only
// comparisons must be calendar based rather than UTC-midnight based.
assert.equal(istDateKey(new Date('2026-09-10T17:59:59Z')), '2026-09-10')
assert.equal(istDateKey(new Date('2026-09-10T18:30:00Z')), '2026-09-11')
assert.equal(istDateKey('2026-09-10'), '2026-09-10')
assert.match(canonicalDoc, /BUSINESS DATE → IST date  → compare as calendar date/)
assert.match(canonicalDoc, /Date-only values must not be converted through UTC midnight/)
assert.match(breakEvenSource, /istDateKey/)
assert.match(targetSource, /effectiveDateKey = x => keyOf\(x\?\.effectiveFrom/)

// Normalization: aliases converge to canonical names and canonical values/types.
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
assert.equal(shiftNormalized.startOdometer, 1000)
assert.equal(shiftNormalized.endOdometer, 1200)
assert.equal(shiftNormalized.toll, 50)
assert.equal(tripNormalized.tripKm, 18.4)
assert.equal(tripNormalized.revenue, 327)
assert.equal(fuelNormalized.odometer, 1200)
assert.equal(fuelNormalized.amount, 820)
assert.equal(fuelNormalized.quantityKg, 10)
assert.equal(fuelNormalized.capturedAt, '2026-09-10T18:00:00+05:30')
assert.match(normalizationSource, /normalizeShiftInput/)
assert.match(normalizationSource, /normalizeTripInput/)
assert.match(normalizationSource, /normalizeFuelInput/)

// Every Admin canonical entity has a defined normalization + validation path.
for (const formKey of ADMIN_FORM_KEYS) {
  const definition = getAdminFormDefinition(formKey)
  assert.ok(definition, `${formKey} must have a canonical form definition`)
  const values = Object.fromEntries((definition.fields ?? []).map(field => [field.key, field.defaultValue]))
  const normalizedValues = normalizeFormValues(definition, values)
  assert.deepEqual(Object.keys(normalizedValues).sort(), (definition.fields ?? []).map(field => field.key).sort(), `${formKey} normalization must cover every canonical field`)
}
assert.match(formRulesSource, /normalizeFormValues/)
assert.match(formRulesSource, /numbersMustBeFinite:true/)

const vehicleDefinition = getAdminFormDefinition('vehicle')
const vehicleNormalized = normalizeFormValues(vehicleDefinition, { registrationNumber: ' X ', make: 'A', model: 'B', acquiredOn: '2026-04-09', openingOdometerKm: '65000', fuelType: 'CNG', status: 'Active' })
assert.equal(vehicleNormalized.registrationNumber, 'X')
assert.equal(vehicleNormalized.openingOdometerKm, 65000)
assert.equal(validateAdminForm(vehicleDefinition, vehicleNormalized).valid, true)
assert.match(adminSource, /validateAdminForm\(definition, values\)/)
assert.match(adminSource, /validateRelationships\(db, formKey, values\)/)
assert.match(adminSource, /relationshipStore/)

// Provenance and authority remain distinct: origin does not itself grant
// calculation authority; correction authority is explicitly field-level on Trip.
assert.match(shiftTripSource, /trip\.tripKmAuthority = 'MANUAL'/)
assert.match(shiftTripSource, /trip\.revenueAuthority = 'MANUAL'/)
assert.match(shiftTripSource, /tripKmProvenance: normalized\.tripKmProvenance \?\? null/)
assert.match(shiftTripSource, /revenueProvenance: normalized\.revenueProvenance \?\? null/)
assert.match(fuelSource, /provenance: normalized\.provenance \?\? null/)
assert.match(canonicalDoc, /Provenance answers \*\*where a value came from\*\*\./)
assert.match(canonicalDoc, /authority, which answers \*\*whether the value is permitted to feed an authoritative calculation\*\*/)

// Lifecycle/deletion: operational state is separate from administrative deletion.
// Admin entities use governed soft deletion; operational Shift/Trip/Fuel paths do not expose incidental physical deletion.
assert.match(shiftTripSource, /status !== 'ACTIVE'/)
assert.match(shiftTripSource, /status = status/)
assert.match(adminSource, /record\.deletedAt = now/)
assert.match(adminSource, /record\.deleted = true/)
assert.doesNotMatch(adminSource, /objectStore\([^)]*\)\.delete\(id\)/)
assert.doesNotMatch(shiftTripSource, /objectStore\([^)]*\)\.delete\(id\)/)
assert.doesNotMatch(fuelSource, /objectStore\([^)]*\)\.delete\(id\)/)
assert.match(canonicalDoc, /An operational status transition must never be implemented as deletion/)
assert.match(canonicalDoc, /Hard deletion of canonical business records requires a separately governed data-destruction contract/)
assert.match(canonicalDoc, /### Entity-specific contract/)

// Relationship and odometer invariants are enforced at the canonical repository boundary.
assert.match(shiftTripSource, /shiftId is required for a Trip/)
assert.match(shiftTripSource, /endOdometer cannot be less than startOdometer/)
assert.match(fuelSource, /must be a finite number/)

// Revenue and odometer ownership: Trip revenue is the source of truth; Shift
// revenue is only a representation; Shift odometers own vehicle movement.
assert.match(shiftTripSource, /shift\.revenue = Number\(normalized\.revenue \|\| 0\)/)
assert.match(canonicalDoc, /Shift-level `revenue` is an aggregate\/lifecycle representation only/)
assert.match(canonicalDoc, /`Trip\.revenue` is the authoritative revenue input/)
assert.match(authorityDoc, /Revenue.*trips/)
assert.match(authorityDoc, /Vehicle KM.*shifts/)

// Repository ownership and canonical stores must remain explicit.
const requiredStores = ['shifts', 'trips', 'fuel_logs', 'vehicles', 'drivers', 'compliance_records', 'maintenance_records', 'driver_collected_data', 'loans', 'loan_payments', 'prepayments', 'driver_targets', 'break_even_inputs', 'settings', 'pending_mutations', 'audit_history']
for (const store of requiredStores) assert.match(indexedDBSource, new RegExp(`['\"]${store}['\"]`), `${store} must remain a canonical store`)
for (const owner of ['ShiftTripRepository', 'FuelRepository', 'MutationRepository', 'AdminRepository']) assert.match(canonicalDoc, new RegExp(owner))
assert.match(canonicalDoc, /driver_collected_data/)
assert.match(canonicalDoc, /loan_payments/)
assert.match(canonicalDoc, /prepayments/)

// Supporting stores are infrastructure/supporting records, not replacement business authorities.
for (const store of ['days', 'odoGaps', 'gps_snapshots', 'movement_artifacts']) assert.match(indexedDBSource, new RegExp(`['\"]${store}['\"]`), `${store} must remain explicitly represented`)
assert.match(canonicalDoc, /supporting\/infrastructure stores/i)

// Historical/as-of relationships: effective-dated domains resolve by IST business date.
assert.match(canonicalDoc, /Historical\/as-of resolution must compare the business date in IST/)
assert.match(breakEvenSource, /istDateKey/)
assert.match(targetSource, /effectiveDateKey/)
assert.match(canonicalDoc, /Effective-date and validity comparisons use IST calendar-date semantics/)

// Mutation propagation remains part of the canonical write contract.
assert.match(adminSource, /notifyCanonicalDataChanged/)
assert.match(shiftTripSource, /notifyCanonicalDataChanged/)
assert.match(fuelSource, /notifyCanonicalDataChanged/)
assert.match(canonicalDoc, /canonical DB mutation\s+↓\s+canonical-data-changed notification/)

console.log('Canonical data contract tests: PASS')
