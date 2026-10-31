import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ADMIN_FORM_KEYS, getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'
import { validateAdminForm } from '../application/admin/universalFormRules.js'

const admin = fs.readFileSync('src/views/AdminView.vue', 'utf8')
const form = fs.readFileSync('src/components/admin/AdminSourceForm.vue', 'utf8')
const expected = ['businessSetup','vehicle','driver','compliance','maintenance','loan']
assert.deepEqual(ADMIN_FORM_KEYS, expected)
for (const key of expected) {
  const definition = getAdminFormDefinition(key)
  assert.ok(definition?.fields?.length, `${key} must expose a usable basic form`)
  const fieldKeys = definition.fields.map(field => field.key)
  assert.equal(new Set(fieldKeys).size, fieldKeys.length, `${key} must not duplicate field keys`)
  assert.ok(definition.fields.every(field => field.label && field.type), `${key} fields need labels and types`)
}
assert.equal(validateAdminForm(getAdminFormDefinition('businessSetup'), { businessStartDate: '2026-05-15' }).valid, true)
assert.equal(validateAdminForm(getAdminFormDefinition('businessSetup'), {}).valid, false)
assert.match(admin, /<AdminSourceForm/)
assert.match(admin, /:busy="saving"/)
assert.match(admin, /@field-change="onSourceFieldChange"/)
assert.match(form, /:required="field\.required"/)
assert.match(form, /function changed\(field, raw\)/)
assert.match(form, /:value="value\(field\)"/)
assert.match(form, /@input="changed\(field, \$event\.target\.value\)"/)
assert.match(form, /function inputType\(field\)/)
assert.match(form, /source-form-section/)
assert.match(form, /aria-label="Admin source record entry"/)
assert.doesNotMatch(admin, /AdminReadModelService|PerformanceService|driverTarget|maintenanceRate|prepayment|amortization|break.?even|provision/i)
assert.doesNotMatch(form, /AdminNativeForm/)
console.log('Basic Admin form field matrix: PASS')
