import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const admin = read('src/views/AdminView.vue')
const app = read('src/App.vue')
const onboarding = read('src/views/FirstRunSetupView.vue')
const setup = read('src/application/setup/firstRunSetupService.js')
const calculations = read('src/views/CalculationsView.vue')
const backup = read('src/application/backup/cloudBackupLifecycle.js')

assert(!admin.includes('SyntheticDataPanel'), 'Synthetic test UI must not remain in the production Admin surface.')
assert(admin.includes('BackupRestorePanel'), 'Backup and restore must remain user-accessible.')
assert(app.includes('FirstRunSetupView'), 'First launch must enter the guided setup journey.')
assert(onboarding.includes('first-run'), 'First-run setup view must be present.')
assert(onboarding.includes('skip'), 'First-run setup must offer skip behavior.')
assert(onboarding.includes('pre-business obligations'), 'Pre-business obligations must be covered by first-run setup.')
assert(setup.includes('firstRunSetup'), 'First-run state must be durably stored.')
assert(setup.includes('Pre-business loan recovery'), 'Setup completeness must explain pre-business recovery.')
assert(calculations.includes('FirstRunSetupService'), 'Admin Calculations must consume setup completeness.')
assert(calculations.includes('Incomplete'), 'Admin Calculations must expose incomplete setup rather than fabricate values.')
assert(backup.includes('maybeDailyCloudBackup'), 'Cloud backup lifecycle must remain active.')
console.log('Prelaunch production readiness contract: PASS')
