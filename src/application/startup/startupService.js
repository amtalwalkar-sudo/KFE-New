import { MutationRepository } from '../../repositories/mutationRepository.js'
import { BackupService } from '../backup/backupService.js'
import { CloudBackupLifecycle } from '../backup/cloudBackupLifecycle.js'
import { DiagnosticService } from '../../infrastructure/diagnostics/diagnosticService.js'

let platform = null
export const configureStartupPlatform = adapter => {
  if (!adapter || typeof adapter.initializeStorage !== 'function' || typeof adapter.registerServiceWorker !== 'function') throw new TypeError('Invalid startup platform adapter.')
  platform = adapter
}

export const initializeApplication = async () => {
  if (!platform) throw new Error('Startup platform adapter has not been configured.')

  DiagnosticService.start('KFE startup')
  DiagnosticService.waiting('Storage initialization', 'Opening the active KFE IndexedDB database.')
  try {
    await platform.initializeStorage()
    DiagnosticService.checkpoint('Storage initialized')
    DiagnosticService.waiting('Mutation recovery', 'Recovering stale canonical SYNCING mutations.')
    await MutationRepository.recoverStaleSyncing()
    DiagnosticService.checkpoint('Mutation recovery complete')
  } catch (error) {
    DiagnosticService.error('Critical startup recovery failed', error)
    throw error
  }

  DiagnosticService.checkpoint('First-render infrastructure ready')

  // Non-critical infrastructure remains part of the startup lifecycle, but must not
  // block the first usable paint. It runs in the background after the readiness gate.
  void platform.registerServiceWorker()
    .then(() => DiagnosticService.checkpoint('Service worker lifecycle scheduled'))
    .catch(error => {
      DiagnosticService.error('Service worker lifecycle failed', error)
      console.warn('KFE service worker registration unavailable:', error)
    })
  void BackupService.maybeDailyLocalBackup()
    .then(() => DiagnosticService.checkpoint('Local backup lifecycle scheduled'))
    .catch(error => {
      DiagnosticService.error('Local backup lifecycle failed', error)
      console.warn('KFE local daily backup failed:', error)
    })
  void (async () => {
    try {
      await CloudBackupLifecycle.registerDailyCloudBackupSchedule()
      DiagnosticService.checkpoint('Cloud backup schedule checked')
    } catch (error) {
      DiagnosticService.error('Cloud backup schedule failed', error)
      console.warn('KFE cloud backup schedule registration failed:', error)
    }
    try {
      await CloudBackupLifecycle.maybeDailyCloudBackup()
      DiagnosticService.checkpoint('Cloud backup lifecycle checked')
    } catch (error) {
      DiagnosticService.error('Cloud backup lifecycle failed', error)
      console.warn('KFE cloud backup lifecycle failed:', error)
    }
  })()

  return { ready: true }
}

export const StartupService = Object.freeze({ configureStartupPlatform, initializeApplication, recoverPendingMutations: () => MutationRepository.recoverStaleSyncing() })
