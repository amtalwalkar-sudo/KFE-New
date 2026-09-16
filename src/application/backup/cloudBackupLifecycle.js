import { BackupService } from './backupService.js'
import { BackupConfig } from './backupConfig.js'

const DAY_MS = 24 * 60 * 60 * 1000

export const initializeConfiguredCloudBackupProvider = () => {
  const provider = BackupConfig.registerConfiguredDropboxProvider()
  if (!provider) return null
  BackupService.registerCloudBackupProvider(provider)
  return provider
}

export const maybeDailyCloudBackup = async ({ force = false } = {}) => {
  const config = BackupConfig.getBackupConfiguration()
  if (!config.enabled || !config.accessToken) return { status: 'disabled' }
  if (!force && config.lastCloudBackupAt && Date.now() - Date.parse(config.lastCloudBackupAt) < DAY_MS) return { status: 'fresh', lastCloudBackupAt: config.lastCloudBackupAt }
  const provider = initializeConfiguredCloudBackupProvider()
  if (!provider) return { status: 'disabled' }
  try {
    const backup = await BackupService.createBackup()
    const result = await BackupService.backupToCloud(backup)
    const completedAt = new Date().toISOString()
    BackupConfig.markCloudBackupCompleted(completedAt)
    return { status: 'backed-up', completedAt, result }
  } catch (error) {
    console.warn('KFE cloud backup failed; canonical and local data remain authoritative:', error)
    return { status: 'failed', error }
  }
}

export const backupToConfiguredCloud = async () => maybeDailyCloudBackup({ force: true })
export const restoreFromConfiguredCloud = async () => {
  const provider = initializeConfiguredCloudBackupProvider()
  if (!provider) throw new Error('Dropbox cloud backup is not configured.')
  return BackupService.restoreFromCloud()
}

export const CloudBackupLifecycle = Object.freeze({ initializeConfiguredCloudBackupProvider, maybeDailyCloudBackup, backupToConfiguredCloud, restoreFromConfiguredCloud })
