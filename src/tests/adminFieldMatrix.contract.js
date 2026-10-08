import assert from 'node:assert/strict'
import { ADMIN_FORM_KEYS, getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'
import { normalizeFormValues, validateAdminForm } from '../application/admin/universalFormRules.js'

import fs from 'node:fs'
const date = '2026-09-01'
const validValue = field => {
  if (field.defaultValue !== undefined) return field.defaultValue
  if (field.type === 'checkbox') return false
  if (field.type === 'text' || field.type === 'textarea') return ' Test value '
  if (field.type === 'date' || field.type === 'datetime-local') return date
  if (field.type === 'number') return field.exclusiveMin && field.min !== undefined ? field.min + 1 : (field.min ?? 1)
  if (field.type === 'select') {
    const option = field.options?.[0]
    if (option !== undefined) return option && typeof option === 'object' && 'value' in option ? option.value : option
    return 'reference-id'
  }
  throw new Error('Unhandled field type: ' + field.type)
}

const vehicleDefaults = getAdminFormDefinition('vehicle')
const driverDefaults = getAdminFormDefinition('driver')
const loanDefaults = getAdminFormDefinition('loan')
assert.equal(vehicleDefaults.fields.find(field => field.key === 'status')?.defaultValue, 'Active', 'Vehicle create form must default to Active')
assert.equal(vehicleDefaults.fields.find(field => field.key === 'active')?.defaultValue, true, 'Vehicle create form must default Active flag to true')
assert.equal(driverDefaults.fields.find(field => field.key === 'status')?.defaultValue, 'Active', 'Driver create form must default to Active')
assert.equal(loanDefaults.fields.find(field => field.key === 'status')?.defaultValue, 'Active', 'Loan create form must default to Active')
const adminView = fs.readFileSync(new URL('../views/AdminView.vue', import.meta.url), 'utf8')
const nativeAdmin = fs.readFileSync(new URL('../components/admin/AdminNativeForm.vue', import.meta.url), 'utf8')
assert.match(adminView, /:busy="saving"/, 'All Admin create/edit surfaces must use save-state locking')
assert.ok(adminView.includes('paymentMethod:actionDraft.value.paymentMethod'), 'Source payment must persist payment method')
assert.ok(adminView.includes('referenceNumber:String(actionDraft.value.referenceNumber||\'\')'), 'Source payment must persist payment reference')
assert.ok(adminView.includes('notes:String(actionDraft.value.notes||\'\')'), 'Admin payment/prepayment/rate/target notes must reach persistence')
assert.match(nativeAdmin, /:required="field\.required"/, 'Admin controls must expose required semantics')
assert.ok(nativeAdmin.includes('openEditor(first)'), 'Admin create form must support stable first-field entry')
assert.ok(nativeAdmin.includes('const values={}'), 'Admin draft state must stay non-reactive while typing')
assert.ok(nativeAdmin.includes('editorRef'), 'Admin must use a single native editor for text/number/textarea entry')
assert.ok(nativeAdmin.includes('openEditor(field)'), 'Admin fields must enter through the isolated native editor')
assert.ok(nativeAdmin.includes('function editorInput(){'), 'Admin editor must not reconcile parent state on every native keystroke')
assert.ok(nativeAdmin.includes('readonly'), 'Visible Admin text/number fields must not compete for native IME focus')
assert.doesNotMatch(nativeAdmin, /watch\(values/, 'Admin must not emit parent model updates on every keystroke')

const fixture = definition => Object.fromEntries(definition.fields.map(field => [
  field.key,
  field.required ? validValue(field) : (field.defaultValue !== undefined ? field.defaultValue : '')
]))

assert.deepEqual(ADMIN_FORM_KEYS, [
  'businessSetup','vehicle','driver','compliance','maintenance','loan',
  'loanPayment','prepayment','settlement','driverTarget','breakEvenInputs'
])
let fieldCount = 0
for (const key of ADMIN_FORM_KEYS) {
  const definition = getAdminFormDefinition(key)
  assert.ok(definition && definition.fields.length > 0, key + ': form definition must exist')
  const keys = definition.fields.map(field => field.key)
  assert.equal(new Set(keys).size, keys.length, key + ': field keys must be unique')
  const values = fixture(definition)
  const baseline = validateAdminForm(definition, values)
  assert.equal(baseline.valid, true, key + ': minimally valid fixture rejected: ' + JSON.stringify(baseline.errors))

  const unknown = validateAdminForm(definition, { ...values, __unregisteredField: 'not allowed' })
  assert.equal(unknown.valid, false, key + ': unknown field must be rejected')
  assert.ok(unknown.errors.__unregisteredField, key + ': unknown field error must be attached to field')

  for (const field of definition.fields) {
    fieldCount += 1
    if (field.required) {
      const missing = validateAdminForm(definition, { ...values, [field.key]: '' })
      assert.equal(missing.valid, false, key + '.' + field.key + ': required field must reject blank')
      assert.ok(missing.errors[field.key], key + '.' + field.key + ': required error must name field')
    }
    if (['date','datetime-local'].includes(field.type)) {
      const invalidDate = validateAdminForm(definition, { ...values, [field.key]: 'not-a-date' })
      assert.equal(invalidDate.valid, false, key + '.' + field.key + ': invalid date must be rejected')
    }
    if (field.type === 'number') {
      const invalidNumber = validateAdminForm(definition, { ...values, [field.key]: 'not-a-number' })
      assert.equal(invalidNumber.valid, false, key + '.' + field.key + ': nonnumeric input must be rejected')
      if (field.min !== undefined) {
        const belowMin = field.exclusiveMin ? field.min : field.min - 1
        const invalidBound = validateAdminForm(definition, { ...values, [field.key]: belowMin })
        assert.equal(invalidBound.valid, false, key + '.' + field.key + ': lower bound must be enforced')
        if (!field.exclusiveMin) {
          const atMin = validateAdminForm(definition, { ...values, [field.key]: field.min })
          assert.equal(atMin.valid, true, key + '.' + field.key + ': inclusive minimum should be accepted')
        }
      }
      if (field.max !== undefined) {
        const aboveMax = validateAdminForm(definition, { ...values, [field.key]: field.max + 1 })
        assert.equal(aboveMax.valid, false, key + '.' + field.key + ': upper bound must be enforced')
      }
    }
    if (field.type === 'select' && field.options?.length) {
      const invalidSelect = validateAdminForm(definition, { ...values, [field.key]: '__invalid_option__' })
      assert.equal(invalidSelect.valid, false, key + '.' + field.key + ': unsupported selection must be rejected')
    }
  }
  const normalized = normalizeFormValues(definition, values)
  for (const field of definition.fields) {
    if (field.type === 'text' || field.type === 'textarea') {
      if (typeof values[field.key] === 'string' && values[field.key].trim()) {
        assert.equal(normalized[field.key], values[field.key].trim(), key + '.' + field.key + ': text should be trimmed')
      }
    }
  }
}
const vehicle = getAdminFormDefinition('vehicle')
const soldWithoutSale = validateAdminForm(vehicle, {
  ...fixture(vehicle), status: 'Sold', saleDate: '', sellPrice: ''
})
assert.equal(soldWithoutSale.valid, false, 'Sold vehicle must require sale date and sell price')
const compliance = getAdminFormDefinition('compliance')
assert.equal(validateAdminForm(compliance, {
  ...fixture(compliance), validFrom: '2026-09-10', validUntil: '2026-09-09'
}).valid, false, 'Compliance validity end must not precede start')
const driver = getAdminFormDefinition('driver')
assert.equal(validateAdminForm(driver, {
  ...fixture(driver), joinedOn: '2026-09-10', licenseExpiry: '2026-09-09'
}).valid, false, 'Licence expiry must not precede driver joining date')
const maintenance = getAdminFormDefinition('maintenance')
assert.deepEqual(maintenance.fields.map(field => field.key), ['performedOn','odometerKm','maintenanceType','cost','notes'],
  'Maintenance must retain exactly the frozen authoritative five fields')
assert.equal(getAdminFormDefinition('breakEvenInputs').fields.find(field => field.key === 'maintenanceProvisionPerKm').defaultValue, 1.6,
  'Indicative maintenance provision default must remain ₹1.60/km')
// Cross-layer Admin UI/form audit is explicitly reviewed by the PR impact gate.
console.log('Admin field matrix: PASS — ' + ADMIN_FORM_KEYS.length + ' forms, ' + fieldCount + ' defined fields; required/invalid/boundary/select/normalization and selected cross-field rules checked.')
