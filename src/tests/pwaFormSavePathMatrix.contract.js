import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const router = read('../router/index.js')
const adminView = read('../views/AdminView.vue')
const firstRun = read('../views/FirstRunSetupView.vue')
const definitions = read('../application/admin/adminFormDefinitions.js')
const adminService = read('../application/admin/adminService.js')
const adminRules = read('../application/admin/universalFormRules.js')
const adminRepo = read('../repositories/adminRepository.js')
const work = read('../views/WorkModuleView.vue')
const workForm = read('../components/work/WorkContextForm.vue')
const workService = read('../application/work/workService.js')
const shiftStore = read('../stores/shiftTrip.js')
const shiftRepo = read('../repositories/shiftTripRepository.js')
const fuelService = read('../application/work/fuel.js')
const fuelRepo = read('../repositories/fuelRepository.js')
const timeline = read('../views/TimelineView.vue')
const timelineService = read('../application/timeline/timelineService.js')
const performanceRepo = read('../repositories/performanceRepository.js')
const performanceService = read('../application/performance/performanceService.js')
const calculations = read('../views/CalculationsView.vue')
const calculationsService = read('../application/calculations/calculationsService.js')
const settings = read('../components/KfeSettingsView.vue')
const drafts = read('../application/forms/formDraftService.js')

const match = (source, pattern, message) => assert.match(source, pattern, message)

// Router inventory: route-level PWA surfaces are the source of truth.
for (const [path, view] of [['/', 'WorkModuleView'], ['/timeline', 'TimelineView'], ['/performance', 'PerformanceView'], ['/admin', 'AdminView']]) {
  assert.match(router, new RegExp('path:\\s*[\'"]' + path.replace('/', '\\/') + '[\'"][^}]*component:\\s*' + view), 'Missing active route ' + path + ' -> ' + view)
}
assert.doesNotMatch(router, /VehicleModuleRole|MaintenanceModuleRole|LoanModuleRole|ComplianceModuleView|AuthoritativeRecordFormRole/, 'Legacy module forms must not silently become active routes')

// Admin matrix: each declared source form must be present and flow through validation into its canonical store.
const adminKeys = ['businessSetup','vehicle','driver','compliance','maintenance','loan','loanPayment','prepayment','settlement','driverTarget','breakEvenInputs']
for (const key of adminKeys) {
  assert.match(definitions, new RegExp('^\\s*' + key + '\\s*:', 'm'), 'Missing Admin form definition ' + key)
}
match(adminView, /AdminService\.save\(selected\.value,payload,id\)/, 'Admin save must include selected form and edit identity')
match(adminService, /validateAdminForm\(definitionFor\(formKey\),values,context\)/, 'AdminService must validate before persistence')
match(adminService, /AdminRepository\.save\(formKey,result\.values,existingId\)/, 'AdminService must persist normalized values')
match(adminRules, /rejectUnknownFields:true/, 'Admin validation must reject unknown fields')
match(adminRepo, /writeMutationAndAudit|pending_mutations/, 'Admin persistence must preserve mutation history')
match(adminRepo, /objectStore\(storeName\)\.put\(record\)/, 'Admin persistence must write the canonical store')
match(firstRun, /AdminService\.save\(current\.value\.form, form\.value\)/, 'First-run source forms must use the same canonical save boundary')

// Work form families: transitions and writes must converge on the canonical trip/shift/fuel repositories.
match(work, /await store\.startShift\(startOdo\.value,/, 'Start Shift must use the shift store')
match(shiftStore, /const startShift = async/, 'Shift store must own Start Shift')
match(workService, /async startShift\(data\)[\s\S]*ShiftTripRepository\.createShift/, 'Start Shift must reach shift repository')
match(work, /await store\.updateTrip\(details\)/, 'Trip details must update the existing trip')
match(workService, /async updateTrip\(data\)[\s\S]*ShiftTripRepository\.updateTrip/, 'Trip update must reach canonical trip repository')
match(work, /await store\.cancelTrip\(\{/, 'Cancellation must use canonical lifecycle')
match(shiftStore, /const cancelTrip = async/, 'Cancellation must be store-owned')
match(work, /WorkService\.recordFuel\(\{/, 'Fuel form must use WorkService')
match(fuelService, /FuelRepository\.create\(\{ \.\.\.validation/, 'Fuel save must use validated repository input')
match(fuelRepo, /objectStore\('fuel_logs'\)|objectStore\(\s*'fuel_logs'\s*\)/, 'Fuel must persist to fuel_logs')
match(work, /await store\.endShift\(\{/, 'End Shift must use shift store')
match(shiftRepo, /completeShift/, 'End Shift must persist through shift repository')
match(workForm, /Additional shift toll/, 'Shift review must label shift toll additional-only')
match(workForm, /Additional shift parking/, 'Shift review must label shift parking additional-only')

// Timeline editors: both need stable record identity, queued drafts, and canonical update paths.
match(timeline, /FormDraftService/, 'Timeline must use the shared IndexedDB draft service')
match(timeline, /tripDraftIdentity\s*=\s*tripId/, 'Timeline trip draft must be tied to a trip identity')
match(timeline, /fuelDraftIdentity\s*=\s*fuelId/, 'Timeline fuel draft must be tied to a fuel record identity')
match(timeline, /TimelineService\./, 'Timeline must use the application service')
match(timelineService, /ShiftTripRepository|FuelRepository/, 'Timeline service must reach canonical operational repositories')

// Calculation consumers must read canonical snapshots instead of making UI-owned financial values authoritative.
match(performanceRepo, /'shifts', 'trips', 'fuel_logs', 'vehicles'/, 'Performance snapshot must read canonical operating records')
match(performanceService, /normalizeCalculationSnapshot\(snapshot\)/, 'Performance must normalize canonical data before calculations')
match(calculations, /CalculationsService\./, 'Calculations view must use calculation service')
match(calculationsService, /FuelRepository\.create\(\{[\s\S]*quantityKg: values\.amount \/ values\.pricePerKg/, 'Manual fuel baseline must validate and persist canonical fuel evidence with derived quantity')
match(settings, /exportBackup\(\)|restoreBackup\(payload\)|resetAllData\(\)/, 'Settings operations must use application backup/reset boundary')

// Draft storage must remain separate from canonical operational records and enforce commit/discard clearing.
match(drafts, /form_drafts/, 'Shared drafts must use dedicated IndexedDB store')
match(drafts, /committed|confirmedDiscard/, 'Draft clear must require a commit or explicit discard')

console.log('PWA form save-path matrix regression contract: PASS')
