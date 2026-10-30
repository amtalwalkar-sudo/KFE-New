import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { ADMIN_FORM_KEYS, getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'
import { validateAdminForm } from '../application/admin/universalFormRules.js'
import { ADMIN_NAVIGATION_CATEGORIES, ADMIN_NAVIGATION_ITEMS, ADMIN_SETTINGS_MENU } from '../presentation/admin/adminNavigation.js'

assert.deepEqual(ADMIN_FORM_KEYS, ['businessSetup','vehicle','driver','compliance','maintenance','loan'])
for (const key of ADMIN_FORM_KEYS) {
  const definition = getAdminFormDefinition(key)
  assert.ok(definition?.fields?.length, `${key} must have a form definition`)
  const fieldKeys = definition.fields.map(field => field.key)
  assert.equal(new Set(fieldKeys).size, fieldKeys.length, `${key} has duplicate fields`)
}
assert.equal(validateAdminForm(getAdminFormDefinition('businessSetup'), { businessStartDate: '2026-05-15' }).valid, true)
assert.equal(validateAdminForm(getAdminFormDefinition('businessSetup'), {}).valid, false)
assert.equal(validateAdminForm(getAdminFormDefinition('vehicle'), { registrationNumber: 'X', make: 'A', model: 'B', acquiredOn: '2026-04-09', openingOdometerKm: 65000, fuelType: 'CNG', status: 'Active' }).valid, true)
assert.equal(validateAdminForm(getAdminFormDefinition('compliance'), { vehicleId: 'v1', complianceType: 'PUC', validFrom: '2026-09-10', validUntil: '2026-09-01' }).valid, false)
assert.equal(ADMIN_FORM_KEYS.includes('driverCollectedData'), false)
assert.equal(ADMIN_FORM_KEYS.includes('ride'), false)
assert.equal(ADMIN_FORM_KEYS.includes('shift'), false)
assert.deepEqual(ADMIN_NAVIGATION_CATEGORIES, ['Business Setup', 'Vehicle Records', 'Finance', 'Settings'])
assert.deepEqual(ADMIN_NAVIGATION_ITEMS.map(item => item.key), ['businessSetup','vehicle','driver','compliance','maintenance','loan','settingsBackup','settingsApplication','settingsReset'])
assert.deepEqual(ADMIN_SETTINGS_MENU.map(item => item.key), ['backup','application','reset'])
assert.doesNotMatch(ADMIN_NAVIGATION_ITEMS.map(item => item.key).join(','), /prepayment|ledger|calculations|driverTarget|maintenanceRate/)
const adminView = await readFile(new URL('../views/AdminView.vue', import.meta.url), 'utf8')
assert.match(adminView, /getAdminSettingsKey\(key\)/)
assert.match(adminView, /Before resetting, create a phone backup JSON file and keep it somewhere you control/)
assert.match(adminView, /private recovery checkpoint[\s\S]*not a substitute for your own exported backup/)
assert.doesNotMatch(adminView, /driverTarget|maintenanceRate|prepayment|amortization|break.?even|provision/i)
console.log('Basic Admin forms and navigation contract: PASS')
