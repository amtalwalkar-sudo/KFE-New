import { MutationRepository } from '../../repositories/mutationRepository.js'
import { BackupService } from '../backup/backupService.js'
import { CloudBackupLifecycle } from '../backup/cloudBackupLifecycle.js'

let platform = null
export const configureStartupPlatform = adapter => {
  if (!adapter || typeof adapter.initializeStorage !== 'function' || typeof adapter.registerServiceWorker !== 'function') throw new TypeError('Invalid startup platform adapter.')
  platform = adapter
}

export const initializeApplication = async () => {
  if (!platform) throw new Error('Startup platform adapter has not been configured.')
  await platform.initializeStorage()
  await platform.registerServiceWorker()
  await BackupService.maybeDailyLocalBackup()
  await CloudBackupLifecycle.registerDailyCloudBackupSchedule()
  await CloudBackupLifecycle.maybeDailyCloudBackup()
  await MutationRepository.recoverStaleSyncing()
  return { ready: true }
}

export const StartupService = Object.freeze({ configureStartupPlatform, initializeApplication, recoverPendingMutations: () => MutationRepository.recoverStaleSyncing() })
