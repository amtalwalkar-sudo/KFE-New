import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const admin = read('src/views/AdminView.vue')
const app = read('src/App.vue')
const onboarding = read('src/views/FirstRunSetupView.vue')
const adminForms = read('src/application/admin/adminFormDefinitions.js')
const backupPanel = read('src/components/admin/BackupRestorePanel.vue')

assert.doesNotMatch(admin, /SyntheticDataPanel|driverTarget|maintenanceRate|prepayment|amortization|break.?even|provision/i)
assert.match(admin, /BackupRestorePanel/, 'Backup and restore must remain user-accessible')
assert.match(app, /FirstRunSetupView/, 'First-run setup must remain available for essential source records')
assert.match(adminForms, /businessStartDate/, 'The basic Admin form must capture the business start date')
assert.match(onboarding, /vehicle|driver/i, 'First-run setup must remain limited to basic source records')
assert.doesNotMatch(onboarding, /pre-business obligations|break.?even|driver target|provision|amortization/i, 'First-run setup must not require retired financial planning inputs')
assert.match(backupPanel, /Create backup/, 'Local phone backup must remain user-accessible')
assert.match(backupPanel, /Restore from phone/, 'Local phone restore must remain user-accessible')
assert.doesNotMatch(backupPanel, /Dropbox|CloudBackupLifecycle|ConnectivityService/i)
console.log('Prelaunch readiness contract: basic setup and recovery only')
