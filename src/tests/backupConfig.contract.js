import assert from 'node:assert/strict'
import { BackupConfig } from '../application/backup/backupConfig.js'
import { CloudBackupLifecycle } from '../application/backup/cloudBackupLifecycle.js'

await BackupConfig.clearBackupConfiguration()
let config = await BackupConfig.getBackupConfiguration()
assert.equal(config.enabled, false)
assert.equal(config.hasAccessToken, false)
assert.equal(config.accessToken, '')
assert.equal(config.path, '/Apps/KFE/kfe-latest-backup.json')
assert.equal(config.lastCloudBackupAt, null)
assert.equal(typeof CloudBackupLifecycle.registerDailyCloudBackupSchedule, 'function')

config = await BackupConfig.saveBackupConfiguration({ enabled: true, accessToken: '  token-123  ', path: 'Apps/KFE/test.json' })
assert.equal(config.enabled, true)
assert.equal(config.hasAccessToken, true)
assert.equal(config.accessToken, '')
assert.equal(config.path, 'Apps/KFE/test.json')
const persisted = await BackupConfig.getBackupConfiguration()
assert.equal(persisted.hasAccessToken, true)
assert.equal(persisted.accessToken, '')

const originalFetch = globalThis.fetch
globalThis.fetch = async () => { throw new Error('network disabled for contract test') }
assert.equal((await CloudBackupLifecycle.maybeDailyCloudBackup()).status, 'failed')
globalThis.fetch = originalFetch

await BackupConfig.clearBackupConfiguration()
config = await BackupConfig.getBackupConfiguration()
assert.equal(config.hasAccessToken, false)
assert.equal((await CloudBackupLifecycle.maybeDailyCloudBackup()).status, 'disabled')
console.log('Backup security/lifecycle contract: PASS')
