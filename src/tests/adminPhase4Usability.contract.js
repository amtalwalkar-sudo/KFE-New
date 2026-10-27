import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const admin = read('src/views/AdminView.vue')
const form = read('src/components/admin/AdminSourceForm.vue')
const css = read('src/styles/kfe-ui.css')

// Remove cumulative provision aggregation/display while retaining the approved effective-dated rate input.
for (const token of ['PerformanceService.getMetrics', 'provisionRange', 'performanceProvisionMetrics', 'maintenanceProvisionTotal', 'maintenanceProvisionBalance', 'provisionAccumulated', 'provisionBalance', 'Total maintenance provision', 'Maintenance pool balance']) {
  assert.equal(admin.includes(token), false, `Cumulative maintenance provision wiring/UI must remain removed: ${token}`)
}
assert.ok(admin.includes('maintenanceProvisionPerKm'), 'The approved effective-dated maintenance rate input must remain.')
assert.ok(admin.includes('Remaining cost'))
assert.ok(admin.includes('Total maintenance paid'))

assert.ok(admin.includes('role="alert" aria-live="assertive"'))
assert.ok(admin.includes('role="status" aria-live="polite"'))
assert.ok(admin.includes('aria-labelledby="admin-detail-title"'))
assert.ok(form.includes(':aria-busy="busy"'))
assert.ok(form.includes('const helpId = field => `${formInstanceId}-help-${field.key}`'))
assert.ok(form.includes('field.help ? helpId(field) : null'))
assert.ok(form.includes('errors[field.key] ? errorId(field) : null'))
assert.ok(form.includes('formElement.value?.querySelector'))
assert.ok(form.includes(':aria-labelledby="`${formInstanceId}-title`"'))
assert.ok(form.includes('role="status" aria-live="polite">Saving your changes…'))
assert.ok(!form.includes('`admin-help-${field.key}`'))
assert.ok(!form.includes('`admin-error-${field.key}`'))
assert.ok(admin.includes('class="detail-intro"'))
assert.ok(admin.includes(':aria-label="`Edit ${label(selected,record)}`"'))
assert.ok(css.includes('.source-form-actions{position:sticky'))
assert.ok(css.includes('.metric-grid strong{overflow-wrap:anywhere'))
assert.ok(css.includes('.detail-intro{margin:-5px 0 14px'))

assert.ok(css.includes('.settings-screen{display:grid;grid-template-columns'))
assert.ok(css.includes('@media(max-width:700px)'))
assert.ok(css.includes('@media(max-height:560px) and (orientation:landscape)'))
assert.ok(css.includes('bottom:calc(var(--kfe-nav-height,76px) + env(safe-area-inset-bottom,0px))'))
assert.ok(css.includes('.admin-page :where(button,a,input,select,textarea):focus-visible'))
assert.ok(css.includes('color-scheme:dark'))
assert.equal(css.includes('--kfe-bg:#f8fafc'), false)
console.log('Admin Phase 4 usability/accessibility contract passed: cumulative provision UI removed, source-rate workflow retained, status/errors announced, field help linked, and responsive dark-only layouts protected.')
