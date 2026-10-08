import { reactive } from 'vue'

const startupState = reactive({
  status: 'starting',
  error: null,
  elapsedMs: 0,
})

let platform = null
let activeAttempt = null
let timer = null

const clearTimer = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export const configureStartupPlatform = adapter => {
  if (!adapter || typeof adapter.initializeStorage !== 'function' || typeof adapter.registerServiceWorker !== 'function') {
    throw new TypeError('Invalid startup platform adapter.')
  }
  platform = adapter
}

export const initializeApplication = async () => {
  if (!platform) throw new Error('Startup platform adapter has not been configured.')

  const [
    { MutationRepository },
    { BackupService },
    { CloudBackupLifecycle },
    { DiagnosticService },
  ] = await Promise.all([
    import('../../repositories/mutationRepository.js'),
    import('../backup/backupService.js'),
    import('../backup/cloudBackupLifecycle.js'),
    import('../../infrastructure/diagnostics/diagnosticService.js'),
  ])

  DiagnosticService.start('KFE startup')
  void platform.registerServiceWorker()
    .then(() => DiagnosticService.checkpoint('Service worker lifecycle scheduled'))
    .catch(error => {
      DiagnosticService.error('Service worker lifecycle failed', error)
      console.warn('KFE service worker registration unavailable:', error)
    })

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
      DiagnosticService.error('KFE cloud backup lifecycle failed', error)
      console.warn('KFE cloud backup lifecycle failed:', error)
    }
  })()
  return { ready: true }
}

export const startApplication = () => {
  if (activeAttempt) return activeAttempt
  const startedAt = Date.now()
  startupState.status = 'starting'
  startupState.error = null
  startupState.elapsedMs = 0
  timer = setInterval(() => { startupState.elapsedMs = Date.now() - startedAt }, 250)
  activeAttempt = initializeApplication()
    .then(result => {
      clearTimer()
      startupState.elapsedMs = Date.now() - startedAt
      startupState.status = 'ready'
      return result
    })
    .catch(error => {
      clearTimer()
      startupState.error = error?.message || 'Application initialization failed.'
      startupState.status = 'error'
      throw error
    })
  return activeAttempt
}

export const resetStartupAttempt = () => {
  activeAttempt = null
  clearTimer()
  startupState.status = 'starting'
  startupState.error = null
  startupState.elapsedMs = 0
  return startApplication()
}

export const StartupService = Object.freeze({
  configureStartupPlatform,
  initializeApplication,
  startApplication,
  resetStartupAttempt,
  recoverPendingMutations: async () => {
    const { MutationRepository } = await import('../../repositories/mutationRepository.js')
    return MutationRepository.recoverStaleSyncing()
  },
})

export { startupState }
