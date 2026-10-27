import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { ADMIN_FORM_KEYS, getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'
import { validateAdminForm } from '../application/admin/universalFormRules.js'
import { ADMIN_NAVIGATION_CATEGORIES, ADMIN_NAVIGATION_ITEMS, ADMIN_SETTINGS_MENU } from '../presentation/admin/adminNavigation.js'

assert.deepEqual(ADMIN_FORM_KEYS,['businessSetup','vehicle','driver','compliance','maintenance','loan','loanPayment','prepayment','settlement','driverTarget','breakEvenInputs'])
const businessSetup=getAdminFormDefinition('businessSetup')
assert.equal(validateAdminForm(businessSetup,{businessStartDate:'2026-05-15'}).valid,true)
assert.equal(validateAdminForm(businessSetup,{}).valid,false)
assert.equal(getAdminFormDefinition('breakEvenInputs').fields.find(f=>f.key==='maintenanceProvisionPerKm').defaultValue,1.6)
assert.equal(ADMIN_FORM_KEYS.includes('driverCollectedData'),false)
assert.equal(ADMIN_FORM_KEYS.includes('ride'),false)
assert.equal(ADMIN_FORM_KEYS.includes('shift'),false)
for(const key of ADMIN_FORM_KEYS){const d=getAdminFormDefinition(key);assert.ok(d?.fields?.length,`${key} must have fields`);const keys=d.fields.map(f=>f.key);assert.equal(new Set(keys).size,keys.length,`${key} has duplicate field keys`)}
const vehicle=getAdminFormDefinition('vehicle')
assert.equal(validateAdminForm(vehicle,{registrationNumber:' X ',make:'A',model:'B',acquiredOn:'2026-04-09',openingOdometerKm:'65000',fuelType:'CNG',status:'Active'}).valid,true)
assert.equal(validateAdminForm(vehicle,{registrationNumber:'X',make:'A',model:'B',acquiredOn:'2026-04-09',openingOdometerKm:65000,fuelType:'CNG',status:'Sold'}).valid,false)
const compliance=getAdminFormDefinition('compliance')
assert.equal(validateAdminForm(compliance,{vehicleId:'v1',complianceType:'PUC',validFrom:'2026-09-10',validUntil:'2026-09-01'}).valid,false)
const loanPayment=getAdminFormDefinition('loanPayment')
assert.equal(validateAdminForm(loanPayment,{loanId:'l1',paidOn:'2026-09-01',amount:100}).valid,true)
const maintenance=getAdminFormDefinition('maintenance')
assert.equal(validateAdminForm(maintenance,{vehicleId:'v1',performedOn:'2026-09-01',maintenanceType:'Service',validityType:'KM based',cost:100}).valid,false)
const adminView = await readFile(new URL('../views/AdminView.vue', import.meta.url), 'utf8')
assert.deepEqual(ADMIN_NAVIGATION_CATEGORIES, ['Business Setup', 'Vehicle Records', 'Finance', 'Settings'])
assert.deepEqual(ADMIN_NAVIGATION_ITEMS.map(item => item.key), ['businessSetup','vehicle','driver','compliance','maintenance','loan','settingsBackup','settingsApplication','settingsReset'])
assert.deepEqual(ADMIN_NAVIGATION_ITEMS.map(item => item.category), ['Business Setup','Business Setup','Business Setup','Vehicle Records','Vehicle Records','Finance','Settings','Settings','Settings'])
assert.deepEqual(ADMIN_SETTINGS_MENU.map(item => item.key), ['backup','application','reset'])
assert.doesNotMatch(ADMIN_NAVIGATION_ITEMS.map(item => item.key).join(','), /prepayment|ledger|calculations|driverTarget|maintenanceRate/)
assert.match(adminView, /getAdminSettingsKey\(key\)/)
assert.match(adminView, /Before resetting, create a phone backup JSON file and keep it somewhere you control/)
assert.match(adminView, /private recovery checkpoint[\s\S]*not a substitute for your own exported backup/)
console.log('Admin contract passed: only Admin-owned master, vehicle, finance and planning forms are exposed; operational Work/Timeline entries are excluded.')

assert.match(adminView, /loanAmortizationSchedule/)
assert.match(adminView, /View.*amortization schedule/)
assert.match(adminView, /paymentState:fullyPaid\?'Paid'/)
assert.match(adminView, /remainingScheduledAmount>1/)
assert.match(adminView, /function onActionFieldChange\(\{key,value\}\)[\s\S]*paymentCalculated\.value=false;paymentConfirmed\.value=false/,
  'Changing a loan payment date or amount must invalidate both its preview and prior confirmation.')
assert.match(adminView, /@click="paymentCalculated=true;paymentConfirmed=false">Calculate payment/,
  'Recalculating a loan payment must require a fresh explicit confirmation even if the amount did not change.')
assert.match(adminView, /function submitActionForm\(values\)[\s\S]*paymentCalculated\.value=true;paymentConfirmed\.value=false/,
  'Keyboard/form submission that recalculates a loan payment must also clear prior confirmation.')

