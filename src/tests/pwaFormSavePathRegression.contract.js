import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const adminView = read('../views/AdminView.vue')
const firstRun = read('../views/FirstRunSetupView.vue')
const definitions = read('../application/admin/adminFormDefinitions.js')
const rules = read('../application/admin/universalFormRules.js')
const adminService = read('../application/admin/adminService.js')
const adminRepo = read('../repositories/adminRepository.js')
const workView = read('../views/WorkModuleView.vue')
const workForm = read('../components/work/WorkContextForm.vue')
const workService = read('../application/work/workService.js')
const shiftStore = read('../stores/shiftTrip.js')
const shiftRepo = read('../repositories/shiftTripRepository.js')
const fuelForm = read('../components/CngFuelModal.vue')
const fuelService = read('../application/work/fuel.js')
const fuelRepo = read('../repositories/fuelRepository.js')
const reconciliation = read('../components/ShiftReconciliationModal.vue')
const endShift = read('../application/work/endShift.js')
const drafts = read('../repositories/formDraftRepository.js')
const settings = read('../components/KfeSettingsView.vue')
const backupPanel = read('../components/admin/BackupRestorePanel.vue')
const backupService = read('../application/backup/backupService.js')
const performanceRepo = read('../repositories/performanceRepository.js')
const performanceService = read('../application/performance/performanceService.js')
const timelineService = read('../application/timeline/timelineService.js')
const calculations = read('../views/CalculationsView.vue')

const has = (source, pattern, message) => assert.match(source, pattern, message)

// 1. Admin source forms: inventory, validation, save, canonical persistence.
const adminKeys = ['businessSetup','vehicle','driver','compliance','maintenance','loan','loanPayment','prepayment','settlement','driverTarget','breakEvenInputs']
for (const key of adminKeys) {
  assert.match(definitions, new RegExp('^\\s*'+key+'\\s*:', 'm'), 'Admin inventory missing '+key)
}
assert.match(adminView, /AdminService\.save\(selected\.value,payload,id\)/, 'Admin submit must route through AdminService with edit identity')
assert.match(adminService, /validateAdminForm\(definitionFor\(formKey\),values,context\)/, 'Admin save must validate the selected form before persistence')
assert.match(adminService, /AdminRepository\.save\(formKey,result\.values,existingId\)/, 'Admin save must pass normalized values and existing ID to repository')
assert.match(adminRepo, /objectStore\(storeName\)\.put\(record\)/, 'Admin repository must persist canonical records')
assert.match(adminRepo, /pending_mutations/, 'Admin persistence must enqueue mutations')
assert.match(adminRepo, /audit_history/, 'Admin persistence must preserve audit history')
assert.match(rules, /normalizeFormValues/, 'Admin validation must normalize form values')

// 2. First-run setup reuses Admin forms and separately persists step state.
assert.match(firstRun, /AdminService\.save\(current\.value\.form, form\.value\)/, 'First-run source forms must share Admin validation/persistence')
assert.match(firstRun, /FirstRunSetupService\.setStepState\(key, \{ status: 'COMPLETE' \}\)/, 'First-run form save must record step completion')
assert.match(firstRun, /BackupConfig\.saveBackupConfiguration\(cloud\.value\)/, 'Cloud backup setup must persist its configuration')
assert.match(firstRun, /CloudBackupLifecycle\.backupToConfiguredCloud\(\)/, 'Cloud backup setup must verify a real backup, not only settings')

// 3. Work shift/trip/cancellation/fuel/end-shift forms.
assert.match(workView, /await store\.startShift\(startOdo\.value,/, 'Start Shift must use shift store')
assert.match(shiftStore, /const startShift = async/, 'Shift store must own Start Shift transition')
assert.match(workService, /async startShift\(data\) \{ const result = await ShiftTripRepository\.createShift\(data\)/, 'Start Shift must reach canonical repository')
assert.match(shiftRepo, /createShift\(data\)/, 'Shift repository must create canonical shift')
assert.match(workView, /await store\.updateTrip\(details\)/, 'Trip details/fare save must update the existing trip')
assert.match(workView, /await store\.cancelTrip\(\{/, 'Cancellation must use canonical trip lifecycle')
assert.match(shiftStore, /const cancelTrip = async/, 'Cancellation transition must be store-owned')
assert.match(workView, /WorkService\.recordFuel\(\{/, 'Fuel form must use Work service')
assert.match(fuelService, /FuelRepository\.create\(\{ \.\.\.validation/, 'Fuel save must persist validated values')
assert.match(fuelRepo, /objectStore\('fuel_logs'\)/, 'Fuel save must write fuel_logs')
assert.match(fuelForm, /<form id="fuel-log-form"/, 'Fuel entry must use native form submission')
assert.match(workView, /await store\.endShift\(\{/, 'End-shift reconciliation must use shift store')
assert.match(endShift, /ShiftTripRepository\.completeShift\(/, 'End-shift finalization must reach canonical shift repository')
assert.match(reconciliation, /@submit\.prevent="handleFinalCommit"/, 'Reconciliation must commit only on final submit')
assert.match(workForm, /Additional shift toll/, 'Shift review must label toll as additional-only')
assert.match(workForm, /Additional shift parking/, 'Shift review must label parking as additional-only')

// 4. Draft recovery: drafts are separate from canonical records and clear only after commit/discard.
assert.match(drafts, /tx\.objectStore\('form_drafts'\)\.put\(record\)/, 'Drafts must use a separate store')
assert.match(drafts, /Form draft can only be cleared after successful commitment or explicit confirmed discard/, 'Draft clear must be guarded')
assert.match(workView, /watch\(\[startOdo, startAck, gapChoice\]/, 'Shift-start edits must survive navigation/restart')
assert.match(workView, /watch\(\[fare, tripToll, tripParking, tripTollTreatment/, 'Trip details edits must be drafted')
assert.match(workView, /watch\(\[cancelReason, cancelFare\]/, 'Cancellation edits must be drafted')
assert.match(workView, /watch\(\[fuelOdo, fuelPrice, fuelAmount, fuelFull\]/, 'Fuel edits must be drafted')
assert.match(workView, /watch\(\[closingOdo, shiftRevenue, toll, parking, tollTreatment, parkingTreatment, endStage/, 'End-shift edits must be drafted')

// 5. Backup, settings, calculation and read-model consumers.
assert.match(settings, /props\.application\.exportBackup\(\)/, 'Settings export must use application boundary')
assert.match(settings, /props\.application\.restoreBackup\(payload\)/, 'Settings restore must use application boundary')
assert.match(settings, /props\.application\.resetAllData\(\)/, 'Settings reset must use application boundary')
assert.match(backupPanel, /BackupService/, 'Admin backup panel must use backup service')
assert.match(backupService, /createBackupRepository\(CANONICAL_BACKUP_STORES\)/, 'Backup service must delegate canonical snapshot reads/writes to the backup repository')
assert.match(performanceRepo, /'shifts', 'trips', 'fuel_logs', 'vehicles'/, 'Performance snapshot must include operational and vehicle records')
assert.match(performanceService, /normalizeCalculationSnapshot\(snapshot\)/, 'Performance must normalize source snapshot before calculations')
assert.match(timelineService, /ShiftTripRepository\.getAllShifts/, 'Timeline must read through canonical shift repository')
assert.ok(calculations.includes('PerformanceService'), 'Calculations view must use the calculation application boundary')

console.log('PWA Form Save-Path Regression Contract: PASS')
console.log(JSON.stringify({adminForms:adminKeys,workForms:['shift start','trip details/fare','cancellation','fuel','end-shift reconciliation'],otherForms:['first-run setup','cloud backup setup','settings backup/restore/reset','Admin backup/restore','calculations'],status:'source-level save-path and consumer checks passed'}))
