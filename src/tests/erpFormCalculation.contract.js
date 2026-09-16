import assert from 'node:assert/strict'
import { getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'

const fields = key => new Set(getAdminFormDefinition(key).fields.map(field => field.key))
const required = (key, names) => { const available = fields(key); for (const name of names) assert.ok(available.has(name), `${key} is missing ERP input ${name}`) }
const requiredField = (key, name) => assert.equal(getAdminFormDefinition(key).fields.find(field => field.key === name)?.required, true, `${key}.${name} must be required`)

required('vehicle', ['openingOdometerKm','fuelType','acquiredOn'])
required('compliance', ['validFrom','validUntil','cost'])
required('maintenance', ['performedOn','cost','odometerKm'])
required('loan', ['principal','annualInterestRate','tenureMonths','startDate'])
required('loanPayment', ['loanId','paidOn','amount','charges','status'])
required('prepayment', ['loanId','paidOn','amount','status'])
required('driverTarget', ['driverId','effectiveFrom','desiredDriverProfit'])
required('breakEvenInputs', ['effectiveFrom','maintenanceProvisionPerKm'])
requiredField('driverTarget', 'desiredDriverProfit')

assert.equal(getAdminFormDefinition('driverCollectedData').calculationRole, 'supporting-only')
assert.equal(getAdminFormDefinition('loanPayment').calculationRole, 'authoritative-payment-record')
assert.equal(getAdminFormDefinition('prepayment').calculationRole, 'authoritative-prepayment-record')
assert.equal(getAdminFormDefinition('breakEvenInputs').calculationRole, 'authoritative-inputs')

const loanPaymentFields = fields('loanPayment')
assert.ok(loanPaymentFields.has('principalComponent') && loanPaymentFields.has('interestComponent'), 'Loan statement components must remain available as source-record evidence.')
const prepaymentFields = fields('prepayment')
assert.ok(prepaymentFields.has('outstandingBefore') && prepaymentFields.has('outstandingAfter'), 'Prepayment balance evidence must remain available as source-record evidence.')

console.log('ERP form/calculation contract: PASS')
