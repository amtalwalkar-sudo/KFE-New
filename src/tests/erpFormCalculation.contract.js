import assert from 'node:assert/strict'
import { getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'

const fields = key => new Set(getAdminFormDefinition(key).fields.map(field => field.key))
const required = (key, names) => { const available = fields(key); for (const name of names) assert.ok(available.has(name), `${key} is missing ERP input ${name}`) }
const requiredField = (key, name) => assert.equal(getAdminFormDefinition(key).fields.find(field => field.key === name)?.required, true, `${key}.${name} must be required`)

required('vehicle', ['openingOdometerKm','fuelType','acquiredOn'])
required('compliance', ['validFrom','validUntil','cost'])
required('maintenance', ['performedOn','cost','odometerKm'])
required('loan', ['principal','tenureMonths','startDate'])
required('loanPayment', ['loanId','paidOn','amount'])
required('prepayment', ['loanId','paidOn','amount'])
required('driverTarget', ['driverId','effectiveFrom','desiredDriverProfit'])
required('breakEvenInputs', ['effectiveFrom','maintenanceProvisionPerKm'])
requiredField('driverTarget', 'desiredDriverProfit')

assert.equal(getAdminFormDefinition('driverCollectedData'), null)
assert.equal(getAdminFormDefinition('shift').calculationRole, 'authoritative-source-correction')
assert.equal(getAdminFormDefinition('loan').calculationRole, 'authoritative')
assert.equal(getAdminFormDefinition('loanPayment').calculationRole, 'authoritative-payment-record')
assert.equal(getAdminFormDefinition('prepayment').calculationRole, 'authoritative-prepayment-record')
assert.equal(getAdminFormDefinition('breakEvenInputs').calculationRole, 'authoritative-inputs')

console.log('ERP form/calculation contract: PASS')
