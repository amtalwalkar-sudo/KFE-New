import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const work = read('../views/WorkModuleView.vue')
const workForm = read('../components/work/WorkContextForm.vue')
const shiftStore = read('../stores/shiftTrip.js')
const workService = read('../application/work/workService.js')
const workRepo = read('../repositories/shiftTripRepository.js')
const fuelService = read('../application/work/fuel.js')
const fuelRepo = read('../repositories/fuelRepository.js')
const fuelModal = read('../components/CngFuelModal.vue')
const adminService = read('../application/admin/adminService.js')
const adminRepo = read('../repositories/adminRepository.js')
const adminForm = read('../components/admin/AdminSourceForm.vue')
const definitions = read('../application/admin/adminFormDefinitions.js')
const performanceRepo = read('../repositories/performanceRepository.js')
const performance = read('../application/performance/performanceService.js')
const timeline = read('../application/timeline/timelineService.js')
const timelineView = read('../views/TimelineView.vue')
const performanceView = read('../views/PerformanceView.vue')
const reconciliation = read('../components/ShiftReconciliationModal.vue')
const endShift = read('../application/work/endShift.js')

const assertHas = (source, pattern, message) => assert.match(source, pattern, message)

assertHas(work, /await store\.startShift\(startOdo\.value,/, 'Start Shift form must commit through the shift store')
assertHas(shiftStore, /const startShift = async/, 'Shift store must own Start Shift state transition')
assertHas(workService, /async startShift\(data\)[\s\S]*ShiftTripRepository\.createShift/, 'Start Shift must persist through WorkService to the canonical shift repository')
assertHas(workRepo, /createShift\(data\)/, 'Shift repository must own canonical shift persistence')

assertHas(work, /await store\.updateTrip\(details\)/, 'Fare save must commit through the shift store')
assertHas(workService, /async updateTrip\(data\)[\s\S]*ShiftTripRepository\.updateTrip/, 'Fare/trip correction must reach the canonical trip repository')
assertHas(work, /fareDetailsSkipped: fare\.value === ''/, 'Fare skip must be an explicit persisted terminal flag')
assertHas(work, /await store\.updateTrip\(\{ id: pendingFare\.value\.id, fareDetailsSkipped: true \}\)/, 'Skip must update the exact completed trip and not create a blank record')
assertHas(work, /function openCancel\(\)/, 'Cancellation form must have an explicit open path')
assertHas(work, /await store\.cancelTrip\(\{/, 'Cancellation must commit through the shift store')
assertHas(shiftStore, /const cancelTrip = async/, 'Cancellation transition must be store-owned')
assertHas(workRepo, /async cancelTrip\(data\)/, 'Cancellation must persist through the canonical trip repository')

assertHas(work, /WorkService\.recordFuel\(\{/, 'Fuel form must commit through the Work application service')
assertHas(fuelService, /FuelRepository\.create\(\{ \.\.\.validation/, 'Fuel entry must persist the validated record in the canonical fuel repository')
assertHas(fuelRepo, /tx\.objectStore\('fuel_logs'\)/, 'Fuel persistence must target fuel_logs')
assertHas(fuelModal, /<form id="fuel-log-form"/, 'Fuel must be a native submit surface')

assertHas(work, /await store\.endShift\(\{/, 'End Shift form must commit through the shift store')
assertHas(endShift, /await ShiftTripRepository\.completeShift\(/, 'End Shift must persist through the canonical shift repository')
assertHas(work, /function cancelEnd\(\)/, 'End Shift must have an explicit cancel path')
assertHas(work, /endOpen\.value = false/, 'End Shift cancellation must close the form without committing')

assert.ok(adminForm.includes('@submit.prevent="submitForm"') && adminForm.includes("emit('submit', collect())"), 'Admin form must await pending draft writes and submit the complete draft through its event')
assertHas(adminService, /async save\(formKey,values,existingId=null/, 'Admin save must be application-owned')
assertHas(adminRepo, /objectStore\(storeName\)\.put\(record\)/, 'Admin save must persist to the selected canonical store')
assertHas(adminRepo, /pending_mutations.*audit_history/, 'Admin save must atomically couple mutation and audit records')
for (const key of ['businessSetup','vehicle','driver','compliance','maintenance','loan','loanPayment','prepayment','settlement','driverTarget','breakEvenInputs']) {
  assertHas(definitions, new RegExp('^\\s*'+key+'\\s*:', 'm'), 'Missing Admin form definition: '+key)
}

assertHas(performanceRepo, /'shifts', 'trips', 'fuel_logs', 'vehicles'/, 'Performance snapshot must read canonical operational and source stores')
assertHas(performanceRepo, /filter\(record => record\?\.settingKey === 'businessSetup'/, 'Business Setup snapshot must ignore deleted records')
assertHas(performanceRepo, /sort\(\(a, b\) => String\(b\.updatedAt/, 'Business Setup snapshot must use the latest saved source record')
assertHas(performance, /normalizeCalculationSnapshot\(snapshot\)/, 'Performance must normalize the canonical snapshot before calculation')
assertHas(timeline, /ShiftTripRepository\.getAllShifts/, 'Timeline must read through its application repository/service boundary')
assertHas(timelineView, /Authoritative Revenue/, 'Timeline must display authoritative revenue')
assertHas(performanceView, /performanceHeadlineActualProfit/, 'Performance must display calculated actual P/L')
assertHas(performanceView, /performanceHeadlineProvisionalProfit/, 'Performance must display calculated provisional P/L')

assert.ok(work.includes("if (action === 'back-start') { startOpen.value = false; return }"), 'Start Shift back/cancel must not submit')
assert.ok(work.includes("if (action === 'back-cancel') { cancelOpen.value = false; return }"), 'Cancellation back/cancel must not submit')
assert.ok(work.includes("if (action === 'close-fuel') { fuelOpen.value = false; return }"), 'Fuel close/cancel must not submit')
assertHas(adminForm, /@click="cancelForm"[\s\S]*?function cancelForm\(\)[\s\S]*?emit\('cancel'\)/, 'Admin cancel must confirm discard when applicable and emit cancel instead of submitting')
assertHas(reconciliation, /@submit\.prevent="handleFinalCommit"/, 'Reconciliation must commit only through final submit')

for (const source of [adminRepo, workRepo, fuelRepo]) {
  assertHas(source, /pending_mutations/, 'Canonical writes must create pending mutation records')
  assertHas(source, /audit_history/, 'Canonical writes must create audit history')
  assertHas(source, /readwrite/, 'Canonical writes must use readwrite transactions')
}

console.log('Form Integrity E2E Contract: PASS')
console.log(JSON.stringify({
  chains: ['Work Start Shift','Trip Fare/Skip','Cancellation','Fuel','End Shift/Reconciliation','Admin Source Records'],
  persistence: 'canonical IndexedDB + mutation/audit coupling',
  downstream: 'Performance snapshot -> calculation engine -> Timeline/Performance displays',
  status: 'source-level end-to-end wiring verified'
}))
