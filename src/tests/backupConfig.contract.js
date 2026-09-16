import assert from 'node:assert/strict'
import { BackupConfig, getBackupConfiguration, saveBackupConfiguration, clearBackupConfiguration } from '../application/backup/backupConfig.js'
import { CloudBackupLifecycle } from '../application/backup/cloudBackupLifecycle.js'

clearBackupConfiguration()
assert.equal(getBackupConfiguration().enabled, false)
assert.equal(getBackupConfiguration().accessToken, '')
assert.equal(getBackupConfiguration().path, '/Apps/KFE/kfe-latest-backup.json')
assert.equal(typeof CloudBackupLifecycle.maybeDailyCloudBackup, 'function')
assert.equal(BackupConfig.getBackupConfiguration().lastCloudBackupAt, null)

const configured = saveBackupConfiguration({ enabled: true, accessToken: '  token-123  ', path: 'Apps/KFE/test.json' })
assert.deepEqual(configured, { enabled: true, accessToken: 'token-123', path: 'Apps/KFE/test.json', lastCloudBackupAt: null })
assert.equal(getBackupConfiguration().accessToken, 'token-123')
assert.equal(getBackupConfiguration().path, 'Apps/KFE/test.json')
const originalFetch = globalThis.fetch
globalThis.fetch = async () => { throw new Error('network disabled for contract test') }
assert.equal((await CloudBackupLifecycle.maybeDailyCloudBackup()).status, 'failed')
globalThis.fetch = originalFetch

clearBackupConfiguration()
assert.equal((await CloudBackupLifecycle.maybeDailyCloudBackup()).status, 'disabled')
console.log('Backup configuration/lifecycle contract: PASS')
