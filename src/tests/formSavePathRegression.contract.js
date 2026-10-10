import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const adminView = read('../views/AdminView.vue')
const adminForm = read('../components/admin/AdminSourceForm.vue')
const definitions = read('../application/admin/adminFormDefinitions.js')
const adminService = read('../application/admin/adminService.js')
const adminRepo = read('../repositories/adminRepository.js')
const workView = read('../views/WorkModuleView.vue')
const workForm = read('../components/work/WorkContextForm.vue')
const workService = read('../application/work/workService.js')
const workRepo = read('../repositories/shiftTripRepository.js')
const fuelModal = read('../components/CngFuelModal.vue')
const fuelService = read('../application/work/fuel.js')
const fuelRepo = read('../repositories/fuelRepository.js')
const performanceService = read('../application/performance/performanceService.js')
const timelineService = read('../application/timeline/timelineService.js')
const universal = read('../presentation/forms/universalFormSystem.js')

const adminKeys = [
  'businessSetup', 'vehicle', 'driver', 'compliance', 'maintenance', 'loan',
  'loanPayment', 'prepayment', 'settlement', 'driverTarget', 'breakEvenInputs'
]

// Form inventory -> presentation -> validation -> persistence.
for (const key of adminKeys) {
  assert.ok(definitions.includes(`  ${key}:{`), `${key}: source form definition must exist`)
  assert.ok(adminRepo.includes(`${key}:`), `${key}: canonical persistence mapping must exist`)
}
assert.match(adminView, /<AdminSourceForm[^>]*@submit="save"/, 'Admin create/edit must submit through the shared replacement form')
assert.match(adminView, /AdminService\.save\(/, 'Admin submit must pass through the validated application service')
assert.match(adminService, /validateAdminForm[\s\S]*AdminRepository\.save/, 'Admin save path must validate before repository persistence')
assert.match(adminRepo, /writeMutationAndAudit/, 'Admin persistence must retain mutation/audit records')

// Work form inventory -> store/application service -> canonical repository.
assert.match(workView, /await store\.startShift\(/, 'Start Shift must use the shift store')
assert.match(workView, /await store\.updateTrip\(details\)/, 'Trip details must use the shift store')
assert.match(workView, /await store\.cancelTrip\(/, 'Cancellation must use the shift store')
assert.match(workView, /WorkService\.recordFuel\(/, 'Fuel must use WorkService')
assert.match(workView, /await store\.endShift\(/, 'End Shift must use the shift store')
assert.match(workService, /ShiftTripRepository\.createShift/, 'Start Shift must reach canonical shift persistence')
assert.match(workService, /ShiftTripRepository\.updateTrip/, 'Trip details must reach canonical trip persistence')
assert.match(workService, /ShiftTripRepository\.cancelTrip/, 'Cancellation must reach canonical trip persistence')
assert.match(fuelService, /FuelRepository\.create/, 'Fuel must reach canonical fuel persistence')
assert.match(fuelRepo, /objectStore\('fuel_logs'\)/, 'Fuel repository must write fuel_logs')
assert.match(workRepo, /completeShift\(/, 'End Shift must reach canonical shift completion')
assert.match(workForm, /update:fuel-partial/, 'Partial-fill control must have an explicit state update path')
assert.match(workView, /fuelPartial = computed/, 'Partial-fill state must be derived consistently from stored full-tank state')

// Saved source facts must feed the existing calculation/read-model consumers.
assert.match(performanceService, /AdminRepository|PerformanceRepository|driverTarget|breakEvenInputs/, 'Performance must consume persisted source facts/read models')
assert.match(timelineService, /PerformanceService|PerformanceRepository|ShiftTripRepository/, 'Timeline must consume canonical operational/read-model data')

// Keyboard behavior is a shared form contract, not a cosmetic hint.
assert.match(universal, /function handleEnter/, 'Shared form runtime must implement Enter/Next/Done navigation')
assert.match(universal, /primaryAction\(surface\)/, 'Shared form runtime must submit from the last editable control')
assert.doesNotMatch(
  adminForm,
  /:enterkeyhint="field\.type === 'textarea' \? 'enter' : 'next'"/,
  'AdminSourceForm must not hard-code Next for every non-textarea, including the last field; last control must expose Done'
)

console.log('PWA form save-path regression contract passed.')
