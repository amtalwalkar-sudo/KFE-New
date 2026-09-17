import assert from 'node:assert/strict'
import { ADMIN_FORM_KEYS, getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'
import { validateAdminForm } from '../application/admin/universalFormRules.js'

assert.deepEqual(ADMIN_FORM_KEYS,['vehicle','driver','compliance','maintenance','driverCollectedData','shift','loan','loanPayment','prepayment','driverTarget','breakEvenInputs'])
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
console.log('Admin contract passed: all authoritative forms are defined and critical cross-field rules reject invalid records.')
