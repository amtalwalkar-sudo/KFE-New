import assert from 'node:assert/strict'
import { getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'
import { validateAdminForm } from '../application/admin/universalFormRules.js'

const fields = key => new Set(getAdminFormDefinition(key).fields.map(field => field.key))
const field = (key,name) => getAdminFormDefinition(key).fields.find(item => item.key===name)
const required = (key, names) => { const available = fields(key); for (const name of names) assert.ok(available.has(name), `${key} is missing ERP input ${name}`) }
const requiredField = (key, name) => assert.equal(field(key,name)?.required, true, `${key}.${name} must be required`)

required('vehicle', ['openingOdometerKm','fuelType','acquiredOn'])
required('compliance', ['validFrom','validUntil','cost'])
required('maintenance', ['performedOn','cost'])
required('loan', ['principal','tenureMonths','startDate'])
required('loanPayment', ['loanId','paidOn','amount'])
required('prepayment', ['loanId','paidOn','amount'])
required('driverTarget', ['driverId','effectiveFrom','desiredDriverProfit'])
required('breakEvenInputs', ['effectiveFrom','maintenanceProvisionPerKm'])
requiredField('driverTarget', 'desiredDriverProfit')

assert.equal(getAdminFormDefinition('driverCollectedData'), null)
assert.equal(getAdminFormDefinition('ride'), null)
assert.equal(getAdminFormDefinition('shift'), null)
assert.equal(getAdminFormDefinition('loan').calculationRole, 'authoritative')
assert.equal(getAdminFormDefinition('loanPayment').calculationRole, 'authoritative-payment-record')
assert.equal(getAdminFormDefinition('prepayment').calculationRole, 'authoritative-prepayment-record')
assert.equal(getAdminFormDefinition('breakEvenInputs').calculationRole, 'authoritative-inputs')
assert.equal(getAdminFormDefinition('compliance').createLabel, 'Compliance Record')

const validLoan = validateAdminForm(getAdminFormDefinition('loan'), {
  lender:' Bank ', principal:'100000', tenureMonths:'12', startDate:'2026-09-01',
  annualInterestRatePercent:'10', status:'Active', notes:''
})
assert.equal(validLoan.valid, true)
assert.equal(validLoan.values.lender, 'Bank')
assert.equal(validLoan.values.principal, 100000)

const zeroLoan = validateAdminForm(getAdminFormDefinition('loan'), {
  lender:'Bank', principal:'0', tenureMonths:'12', startDate:'2026-09-01',
  annualInterestRatePercent:'10', status:'Active'
})
assert.equal(zeroLoan.valid, false)
assert.match(zeroLoan.errors.principal, /greater than 0/)

for (const key of ['loanPayment','prepayment']) {
  const definition=getAdminFormDefinition(key)
  const values={loanId:'loan-1',paidOn:'2026-09-01',amount:'0'}
  const result=validateAdminForm(definition,values)
  assert.equal(result.valid,false, `${key} must reject zero actual movement`)
  assert.match(result.errors.amount,/greater than 0/)
}

const reversedTarget=validateAdminForm(getAdminFormDefinition('driverTarget'),{
  driverId:'driver-1',effectiveFrom:'2026-09-20',effectiveUntil:'2026-09-19',desiredDriverProfit:'1000'
})
assert.equal(reversedTarget.valid,false)
assert.equal(reversedTarget.errors.effectiveUntil,'Effective until cannot precede effective from.')

const reversedBreakEven=validateAdminForm(getAdminFormDefinition('breakEvenInputs'),{
  effectiveFrom:'2026-09-20',effectiveUntil:'2026-09-19',maintenanceProvisionPerKm:'2'
})
assert.equal(reversedBreakEven.valid,false)
assert.equal(reversedBreakEven.errors.effectiveUntil,'Effective until cannot precede effective from.')

const badMaintenance=validateAdminForm(getAdminFormDefinition('maintenance'),{
  vehicleId:'vehicle-1',performedOn:'2026-09-20',maintenanceType:'Service',
  cost:'100'
})
assert.equal(badMaintenance.valid,true)

const unknown=validateAdminForm(getAdminFormDefinition('driver'),{name:'A',status:'Active',unexpected:'x'})
assert.equal(unknown.valid,false)
assert.equal(unknown.errors.unexpected,'Unknown field is not permitted.')

const selectDefinition={key:'selectContract',fields:[{key:'reference',label:'Reference',type:'select',options:[{value:'v1',label:'Vehicle 1'}]},{key:'active',label:'Active',type:'checkbox'}]}
const readableSelect=validateAdminForm(selectDefinition,{reference:'v1',active:'false'})
assert.equal(readableSelect.valid,true)
assert.equal(readableSelect.values.reference,'v1')
assert.equal(readableSelect.values.active,false)
assert.equal(validateAdminForm(selectDefinition,{reference:'missing',active:'false'}).valid,false)

console.log('ERP form/calculation contract: PASS')
