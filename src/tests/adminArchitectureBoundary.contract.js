import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ADMIN_FORM_KEYS, ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import { validateAdminForm } from '../application/admin/universalFormRules.js'

const read = path => fs.readFileSync(path, 'utf8')
const repository = read('src/repositories/adminRepository.js')
const service = read('src/application/admin/adminService.js')
const rules = read('src/application/admin/universalFormRules.js')
const view = read('src/views/AdminView.vue')
const router = read('src/router/index.js')
const architecture = read('docs/KFE-ARCHITECTURE-CONTRACT.md')
const formStandard = read('docs/KFE-UNIVERSAL-FORM-STANDARD.md')

assert.deepEqual(ADMIN_FORM_KEYS, ['businessSetup', 'vehicle', 'driver', 'compliance', 'maintenance', 'loan'])
assert.ok(ADMIN_FORM_KEYS.every(key => ADMIN_FORM_DEFINITIONS[key]?.fields?.length))
assert.equal(Object.hasOwn(ADMIN_FORM_DEFINITIONS.loan, 'calculationRole'), false)

for (const retiredRule of ['driverTarget', 'breakEvenInputs', 'loanPayment', 'prepayment', 'settlement', "definition.key==='ride'", 'tripKm']) {
  assert.equal(rules.includes(retiredRule), false, `Admin validation must not retain retired rule: ${retiredRule}`)
}

assert.match(service, /validateAdminForm\(definitionFor\(formKey\),values,context\)/)
assert.match(service, /AdminRepository\.save\(formKey,result\.values,existingId\)/)
assert.doesNotMatch(repository, /from ['"][^'"]*application\/admin\//, 'Persistence must not depend upward on Admin application definitions or validation.')
assert.doesNotMatch(repository, /validateAdminForm|getAdminFormDefinition/, 'Admin validation must have one application-layer owner.')
assert.doesNotMatch(repository, /getSetting|saveSetting/, 'Admin must not retain a second direct settings persistence path outside AdminService.save.')
assert.match(repository, /maintenance: \[\['vehicleId', 'vehicles'\]\]/)
assert.match(repository, /\{ store: 'maintenance_records', field: 'vehicleId', label: 'maintenance' \}/)
assert.match(repository, /const dependencies = dependentRecordStores\[formKey\] \|\| \[\]/)
assert.match(repository, /db\.transaction\(\[\.\.\.stores\], 'readwrite'\)/)
assert.match(repository, /tx\.objectStore\(dependency\.store\)\.getAll\(\)/)
assert.match(repository, /linked \$\{dependency\.label\} records still reference it/)
assert.doesNotMatch(repository, /validateRelationships/)

assert.match(view, /const generation = \+\+loadGeneration/)
assert.match(view, /Promise\.all\(Object\.keys\(all\.value\)\.map/)
assert.match(view, /if \(generation !== loadGeneration\) return/)
assert.match(view, /Dark-only appearance/)
assert.doesNotMatch(view, /AdminFinanceView|AdminBreakEven|FinanceLedgerPanel|LoanModuleView|loanReadModelService|loanEngine|amortization|prepayment/i)

assert.match(router, /name: 'Admin', component: AdminView/)
assert.doesNotMatch(router, /LoanModuleView|FinancialModule|CalculationsView/)
assert.match(architecture, /Admin form and data path/)
assert.match(architecture, /AdminRepository must not import application form definitions or validation/)
assert.match(formStandard, /FormDraftService stores only non-authoritative unfinished input/)

const invalidDate = validateAdminForm(ADMIN_FORM_DEFINITIONS.businessSetup, { businessStartDate: '2026-02-30' })
assert.equal(invalidDate.valid, false, 'Invalid calendar dates must not pass Admin validation.')
const zeroCost = validateAdminForm(ADMIN_FORM_DEFINITIONS.vehicle, {
  registrationNumber: 'MH01AA0001', make: 'Make', model: 'Model', acquiredOn: '2026-04-09',
  openingOdometerKm: 0, fuelType: 'CNG', status: 'Active', acquisitionValue: 0,
})
assert.equal(zeroCost.valid, true, 'A valid zero-valued source fact must remain valid.')
console.log('Admin architecture boundary contract: PASS')
