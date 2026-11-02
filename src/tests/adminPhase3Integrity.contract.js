import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const repository = read('src/repositories/adminRepository.js')
const adminService = read('src/application/admin/adminService.js')
const forms = read('src/application/admin/adminFormDefinitions.js')
const view = read('src/views/AdminView.vue')
const navigation = read('src/presentation/admin/adminNavigation.js')
const backup = read('src/application/backup/backupService.js')

assert.match(repository, /const ACTIVE_ADMIN_FORM_KEYS = new Set\(\['businessSetup','vehicle','driver','compliance','maintenance','loan'\]\)/)
assert.match(repository, /if \(!ACTIVE_ADMIN_FORM_KEYS\.has\(formKey\)\) throw new Error/)
assert.match(repository, /async remove\(formKey, id\)/)
assert.doesNotMatch(repository, /loanPayment|prepayment|driverTarget|breakEvenInputs|settlementSourceType|readLiveSettlementsForSource|calculateEmi|loanEngine/)
assert.match(adminService, /AdminRepository\.save\(formKey/)
assert.doesNotMatch(adminService, /driverTarget|breakEvenInputs|prepayment|loanPayment|settlement/)
assert.deepEqual((forms.match(/^\s{2}[A-Za-z][A-Za-z0-9]+:\s*\{/gm) || []).map(line => line.trim().split(':')[0]), ['businessSetup','vehicle','driver','compliance','maintenance','loan'])
assert.doesNotMatch(view, /prepayment|driverTarget|breakEvenInputs|maintenanceRate|CalculationsView/i)
assert.doesNotMatch(navigation, /settlement|prepayment|driverTarget|breakEvenInputs|maintenanceRate|calculations/i)
for (const store of ['settlements','loan_payments','prepayments','driver_targets','break_even_inputs']) assert.ok(backup.includes(`'${store}'`), `${store} must remain available for backup preservation`)
console.log('Admin scope/data integrity contract: active forms only; retired financial records remain preserved in backup.')
