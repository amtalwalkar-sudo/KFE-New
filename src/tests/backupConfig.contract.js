import assert from 'node:assert/strict'
import fs from 'node:fs'
import { BackupConfig } from '../application/backup/backupConfig.js'
import { CloudBackupLifecycle } from '../application/backup/cloudBackupLifecycle.js'
import { createBackupConfigAdapter } from '../infrastructure/backup/backupConfigAdapter.js'

BackupConfig.configureBackupConfig(createBackupConfigAdapter())
const backupPanelSource = fs.readFileSync('src/components/admin/BackupRestorePanel.vue', 'utf8');
assert.match(backupPanelSource, /class="connected"[\s\S]*@click="saveCloudConfig"[^>]*>Save settings/, 'Connected Dropbox settings must have a save action after the enabled toggle changes.')
const secureStoreSource = fs.readFileSync('src/infrastructure/security/secureSecretStore.js', 'utf8'); const nativeSecureStoreSource = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeSecureStoragePlugin.java', 'utf8'); assert.match(nativeSecureStoreSource, /AndroidKeyStore/); assert.match(nativeSecureStoreSource, /\.commit\(\)/, 'Native secure credentials must be durably committed before the save operation resolves.'); assert.match(secureStoreSource, /subtle\.generateKey/); assert.match(secureStoreSource, /indexedDB/); assert.match(secureStoreSource, /AES-GCM/);
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
config = await BackupConfig.saveBackupConfiguration({ enabled: false, accessToken: '' })
assert.equal(config.enabled, false, 'Disabling Dropbox must persist when the existing token is retained securely')
assert.equal(config.hasAccessToken, true, 'Saving connected Dropbox settings without re-entering a token must preserve the secure token')
config = await BackupConfig.saveBackupConfiguration({ enabled: true, accessToken: '' })
assert.equal(config.enabled, true)

const originalFetch = globalThis.fetch
globalThis.fetch = async () => { throw new Error('network disabled for contract test') }
assert.equal((await CloudBackupLifecycle.maybeDailyCloudBackup()).status, 'failed')
globalThis.fetch = originalFetch

await BackupConfig.clearBackupConfiguration()
config = await BackupConfig.getBackupConfiguration()
assert.equal(config.hasAccessToken, false)
assert.equal((await CloudBackupLifecycle.maybeDailyCloudBackup()).status, 'disabled')
console.log('Backup security/lifecycle contract: PASS')
