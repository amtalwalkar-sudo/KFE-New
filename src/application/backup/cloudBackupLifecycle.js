import { BackupService } from './backupService.js'
import { BackupConfig } from './backupConfig.js'

const DAY_MS = 24 * 60 * 60 * 1000
let scheduler = null
let beforeBackup = null
let activeCloudBackupAttempt = null

export const configureBeforeCloudBackup = callback => {
  if (callback != null && typeof callback !== 'function') throw new TypeError('Cloud backup recovery hook must be a function.')
  beforeBackup = callback || null
}

export const configureCloudBackupScheduler = nextScheduler => {
  if (!nextScheduler || typeof nextScheduler.registerDaily !== 'function') throw new TypeError('Invalid cloud backup scheduler.')
  scheduler = nextScheduler
}

export const initializeConfiguredCloudBackupProvider = async () => {
  const provider = await BackupConfig.registerConfiguredBackupProvider()
  if (!provider) return null
  BackupService.registerCloudBackupProvider(provider)
  return provider
}

export const registerDailyCloudBackupSchedule = async () => scheduler ? scheduler.registerDaily() : false

const runCloudBackupAttempt = async ({ force = false } = {}) => {
  try {
    const config = await BackupConfig.getBackupConfiguration()
    if (!config.enabled || !config.hasAccessToken) return { status: 'disabled' }
    if (!force && config.lastCloudBackupAt && Date.now() - Date.parse(config.lastCloudBackupAt) < DAY_MS) return { status: 'fresh', lastCloudBackupAt: config.lastCloudBackupAt }
    const provider = await initializeConfiguredCloudBackupProvider()
    if (!provider) return { status: 'disabled' }
    if (beforeBackup) await beforeBackup()
    const backup = await BackupService.createBackup()
    const result = await BackupService.backupToCloud(backup)
    const completedAt = new Date().toISOString()
    await BackupConfig.markCloudBackupCompleted(completedAt)
    return { status: 'backed-up', completedAt, result }
  } catch (error) {
    console.warn('KFE cloud backup failed; canonical and local data remain authoritative:', error)
    try { await BackupConfig.markCloudBackupFailed(error?.message || error) } catch (statusError) { console.warn('KFE could not persist cloud backup failure status:', statusError) }
    return { status: 'failed', error }
  }
}

export const maybeDailyCloudBackup = (options = {}) => {
  if (activeCloudBackupAttempt) return activeCloudBackupAttempt
  activeCloudBackupAttempt = runCloudBackupAttempt(options).finally(() => { activeCloudBackupAttempt = null })
  return activeCloudBackupAttempt
}

export const backupToConfiguredCloud = async () => maybeDailyCloudBackup({ force: true })
export const restoreFromConfiguredCloud = async () => {
  const provider = await initializeConfiguredCloudBackupProvider()
  if (!provider) throw new Error('Configured cloud backup is unavailable.')
  return BackupService.restoreFromCloud()
}

export const CloudBackupLifecycle = Object.freeze({ configureCloudBackupScheduler, configureBeforeCloudBackup, initializeConfiguredCloudBackupProvider, registerDailyCloudBackupSchedule, maybeDailyCloudBackup, backupToConfiguredCloud, restoreFromConfiguredCloud })
