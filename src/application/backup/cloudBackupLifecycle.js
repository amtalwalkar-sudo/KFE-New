import { BackupService } from './backupService.js'
import { BackupConfig } from './backupConfig.js'

const DAY_MS = 24 * 60 * 60 * 1000

export const initializeConfiguredCloudBackupProvider = async () => {
  const provider = await BackupConfig.registerConfiguredDropboxProvider()
  if (!provider) return null
  BackupService.registerCloudBackupProvider(provider)
  return provider
}

export const registerDailyCloudBackupSchedule = async () => {
  try {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'periodicSync' in ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready
      const permission = await navigator.permissions?.query?.({ name: 'periodic-background-sync' }).catch(() => null)
      if (!permission || permission.state !== 'denied') await registration.periodicSync.register('kfe-daily-cloud-backup', { minInterval: DAY_MS })
      return true
    }
  } catch (error) { console.warn('KFE periodic cloud backup registration unavailable:', error) }
  return false
}

export const maybeDailyCloudBackup = async ({ force = false } = {}) => {
  const config = await BackupConfig.getBackupConfiguration()
  if (!config.enabled || !config.hasAccessToken) return { status: 'disabled' }
  if (!force && config.lastCloudBackupAt && Date.now() - Date.parse(config.lastCloudBackupAt) < DAY_MS) return { status: 'fresh', lastCloudBackupAt: config.lastCloudBackupAt }
  const provider = await initializeConfiguredCloudBackupProvider()
  if (!provider) return { status: 'disabled' }
  try {
    const backup = await BackupService.createBackup()
    const result = await BackupService.backupToCloud(backup)
    const completedAt = new Date().toISOString()
    await BackupConfig.markCloudBackupCompleted(completedAt)
    return { status: 'backed-up', completedAt, result }
  } catch (error) {
    console.warn('KFE cloud backup failed; canonical and local data remain authoritative:', error)
    return { status: 'failed', error }
  }
}

export const backupToConfiguredCloud = async () => maybeDailyCloudBackup({ force: true })
export const restoreFromConfiguredCloud = async () => {
  const provider = await initializeConfiguredCloudBackupProvider()
  if (!provider) throw new Error('Dropbox cloud backup is not configured.')
  return BackupService.restoreFromCloud()
}

export const CloudBackupLifecycle = Object.freeze({ initializeConfiguredCloudBackupProvider, registerDailyCloudBackupSchedule, maybeDailyCloudBackup, backupToConfiguredCloud, restoreFromConfiguredCloud })
