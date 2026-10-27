import assert from 'node:assert/strict'
import fs from 'node:fs'
import { ADMIN_FORM_KEYS, getAdminFormDefinition } from '../application/admin/adminFormDefinitions.js'
import {
  ADMIN_NAVIGATION_CATEGORIES,
  ADMIN_NAVIGATION_ITEMS,
  ADMIN_SETTINGS_MENU,
} from '../presentation/admin/adminNavigation.js'

const read = path => fs.readFileSync(path, 'utf8')
const admin = read('src/views/AdminView.vue')
const css = read('src/styles/kfe-ui.css')
const drafts = read('src/tests/adminDraftRecovery.contract.js')
const integrity = read('src/tests/adminPhase3Integrity.contract.js')
const usability = read('src/tests/adminPhase4Usability.contract.js')
const apkWorkflow = read('.github/workflows/android-apk-on-request.yml')
const packageJson = JSON.parse(read('package.json'))

// Release inventory: preserve the exact approved four-category, nine-entry Admin surface.
assert.deepEqual(ADMIN_NAVIGATION_CATEGORIES, ['Business Setup', 'Vehicle Records', 'Finance', 'Settings'])
assert.deepEqual(ADMIN_NAVIGATION_ITEMS.map(({ key }) => key), [
  'businessSetup', 'vehicle', 'driver', 'compliance', 'maintenance', 'loan',
  'settingsBackup', 'settingsApplication', 'settingsReset',
])
assert.equal(ADMIN_NAVIGATION_ITEMS.length, 9)
assert.equal(new Set(ADMIN_NAVIGATION_ITEMS.map(({ key }) => key)).size, 9)
assert.deepEqual(ADMIN_SETTINGS_MENU.map(({ key }) => key), ['backup', 'application', 'reset'])
assert.equal(ADMIN_NAVIGATION_ITEMS.some(({ title, key }) => /ledger|prepayment/i.test(title + ' ' + key)), false)

// Every approved Admin form definition remains registered and structurally safe.
assert.deepEqual(ADMIN_FORM_KEYS, [
  'businessSetup', 'vehicle', 'driver', 'compliance', 'maintenance', 'loan',
  'loanPayment', 'prepayment', 'settlement', 'driverTarget', 'breakEvenInputs',
])
for (const key of ADMIN_FORM_KEYS) {
  const definition = getAdminFormDefinition(key)
  assert.ok(definition?.fields?.length, key + ': release form definition must exist')
  const fieldKeys = definition.fields.map(({ key: fieldKey }) => fieldKey)
  assert.equal(new Set(fieldKeys).size, fieldKeys.length, key + ': field keys must be unique')
}
assert.ok(admin.includes('Loan Prepayment'), 'Prepayment workflow must remain available inside Loan, not as a top-level menu item.')
assert.ok(admin.includes('Backup & Restore') || admin.includes('Backup and Restore') || admin.includes('Backup'))

// Explicitly reject reintroduction of the previously removed cumulative-provision feature.
for (const token of [
  'PerformanceService.getMetrics', 'provisionRange', 'performanceProvisionMetrics',
  'maintenanceProvisionTotal', 'maintenanceProvisionBalance', 'provisionAccumulated',
  'provisionBalance', 'Total maintenance provision', 'Maintenance pool balance',
]) {
  assert.equal(admin.includes(token), false, 'Rejected cumulative maintenance-provision UI/wiring must stay absent: ' + token)
}
assert.ok(admin.includes('maintenanceProvisionPerKm'), 'Approved effective-dated per-kilometre rate input must remain.')
assert.ok(admin.includes('Total maintenance paid'), 'Actual payment history/summary must remain.')

// Guard the release constraints with existing Phase 2–4 contracts and the dark-only responsive shell.
assert.ok(drafts.includes('FormDraftService.newWorkflowId()'))
assert.ok(admin.includes('await clearFormDraft(draftIdentity)'), 'Canonical Admin saves must clear the matching draft only after persistence succeeds.')
assert.ok(integrity.includes('transaction'))
assert.ok(usability.includes('color-scheme:dark'))
assert.ok(css.includes('@media(max-width:700px)'))
assert.ok(css.includes('@media(max-height:560px) and (orientation:landscape)'))
assert.ok(css.includes('safe-area-inset-bottom'))
assert.ok(css.includes(':focus-visible'))
assert.equal(css.includes('--kfe-bg:#f8fafc'), false)

// Verify the real APK pipeline produces a discoverable artifact and fails if it is missing.
assert.equal(typeof packageJson.scripts.build, 'string')
assert.match(apkWorkflow, /issue_comment:/)
assert.match(apkWorkflow, /github\.event\.comment\.body == '\/build-apk'/)
assert.match(apkWorkflow, /run: npm ci/)
assert.match(apkWorkflow, /run: npm run build/)
assert.match(apkWorkflow, /run: npx cap sync android/)
assert.match(apkWorkflow, /run: \.\/gradlew assembleDebug/)
assert.match(apkWorkflow, /com\.kanishka\.pwa/)
assert.match(apkWorkflow, /EXPECTED_CERT_SHA256/)
assert.match(apkWorkflow, /name: kfe-android-debug-apk[\s\S]*?if-no-files-found: error/)
assert.match(apkWorkflow, /name: kfe-android-signing-identity[\s\S]*?if-no-files-found: error/)

console.log('Admin Phase 5 release-readiness contract passed: approved navigation/forms, draft/integrity/usability guards, rejected-feature absence, dark-only responsive layout, and signed APK artifact pipeline are protected.')
