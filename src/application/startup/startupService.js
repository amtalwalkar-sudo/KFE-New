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

  // Critical readiness gate: canonical storage must be available and stale mutations
  // must be recovered before business UI is considered ready.
  await platform.initializeStorage()
  await MutationRepository.recoverStaleSyncing()

  // Non-critical infrastructure remains part of the startup lifecycle, but must not
  // block the first usable paint. It runs in the background after the readiness gate.
  void platform.registerServiceWorker().catch(error => console.warn('KFE service worker registration unavailable:', error))
  void BackupService.maybeDailyLocalBackup().catch(error => console.warn('KFE local daily backup failed:', error))
  void (async () => {
    try { await CloudBackupLifecycle.registerDailyCloudBackupSchedule() } catch (error) { console.warn('KFE cloud backup schedule registration failed:', error) }
    try { await CloudBackupLifecycle.maybeDailyCloudBackup() } catch (error) { console.warn('KFE cloud backup lifecycle failed:', error) }
  })()

  return { ready: true }
}

export const StartupService = Object.freeze({ configureStartupPlatform, initializeApplication, recoverPendingMutations: () => MutationRepository.recoverStaleSyncing() })
