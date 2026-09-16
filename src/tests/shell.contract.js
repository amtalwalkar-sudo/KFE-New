import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { access } from 'node:fs/promises'

const app = await readFile(new URL('../App.vue', import.meta.url), 'utf8')
const main = await readFile(new URL('../main.js', import.meta.url), 'utf8')
const router = await readFile(new URL('../router/index.js', import.meta.url), 'utf8')

assert.match(app, /<router-view/)
assert.match(app, /bottom-nav/)
assert.doesNotMatch(app, /ShellService|BackupService|CloudBackupLifecycle|initializeCanonicalStorage|serviceWorker|indexedDB/i)
assert.match(main, /StartupService\.initializeApplication/)
assert.match(main, /CloudBackupLifecycle\.configureCloudBackupScheduler/)
assert.doesNotMatch(app, /useShiftTripStore/)
assert.match(router, /path: '\/'/)
assert.match(router, /path: '\/performance'/)
assert.match(router, /path: '\/admin'/)
assert.doesNotMatch(router, /ride-capture|RideCapture/i)
try { await access(new URL('../application/shell/shellService.js', import.meta.url)); assert.fail('obsolete shell service still exists') } catch (_) {}
console.log('Shell contract passed: presentation shell is isolated and startup is composed at the application root.')
