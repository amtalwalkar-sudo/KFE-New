import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const admin = read('src/views/AdminView.vue')
const form = read('src/components/admin/AdminSourceForm.vue')
const css = read('src/styles/kfe-ui.css')

// Remove cumulative provision aggregation/display while retaining the approved effective-dated rate input.
for (const pattern of [/PerformanceService\\.getMetrics/, /provisionRange/, /performanceProvisionMetrics/, /maintenanceProvisionTotal/, /maintenanceProvisionBalance/, /provisionAccumulated/, /provisionBalance/, /Total maintenance provision/, /Maintenance pool balance/]) {
  assert.doesNotMatch(admin, pattern, `Cumulative maintenance provision wiring/UI must remain removed: ${pattern}`)
}
assert.match(admin, /maintenanceProvisionPerKm/)
assert.match(admin, /Remaining cost/)
assert.match(admin, /Total maintenance paid/)

assert.match(admin, /role="alert" aria-live="assertive"/)
assert.match(admin, /role="status" aria-live="polite"/)
assert.match(admin, /aria-labelledby="admin-detail-title"/)
assert.match(form, /:aria-busy="busy"/)
assert.match(form, /admin-help-\$\\{field.key\\}/)
assert.match(form, /field.help \? `admin-help-\$\\{field.key\\}` : null/)
assert.match(form, /errors\\[field.key\\] \? `admin-error-\$\\{field.key\\}` : null/)
assert.match(form, /formElement\\.value\\?\\.querySelector/)

assert.match(css, /\\.settings-screen\\{display:grid;grid-template-columns/)
assert.match(css, /@media\\(max-width:700px\\)/)
assert.match(css, /@media\\(max-height:560px\\) and \\(orientation:landscape\\)/)
assert.match(css, /bottom:calc\\(var\\(--kfe-nav-height,76px\\) \\+ env\\(safe-area-inset-bottom,0px\\)\\)/)
assert.match(css, /\\.admin-page :where\\(button,a,input,select,textarea\\):focus-visible/)
assert.match(css, /color-scheme:dark/)
assert.doesNotMatch(css, /--kfe-bg:#f8fafc/)
console.log('Admin Phase 4 usability/accessibility contract passed: cumulative provision UI removed, source-rate workflow retained, status/errors announced, field help linked, and responsive dark-only layouts protected.')
