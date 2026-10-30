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
    { DiagnosticService },
  ] = await Promise.all([
    import('../../repositories/mutationRepository.js'),
    import('../backup/backupService.js'),
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
    // A pending reset must finish before stale outbox/create-intent work can replay.
    DiagnosticService.waiting('Reset recovery', 'Checking for an interrupted cross-store reset.')
    await BackupService.recoverPendingReset()
    DiagnosticService.checkpoint('Reset recovery complete')
    // A restore journal may represent a process death between SQLite and
    // IndexedDB. Finish the same idempotent restore before replaying mutations.
    DiagnosticService.waiting('Backup restore recovery', 'Resuming an interrupted offline backup restore if needed.')
    await BackupService.recoverPendingRestore()
    DiagnosticService.checkpoint('Backup restore recovery complete')
    DiagnosticService.waiting('Mutation recovery', 'Recovering stale canonical SYNCING mutations.')
    await MutationRepository.recoverStaleSyncing()
    DiagnosticService.checkpoint('Mutation recovery complete')
  } catch (error) {
    DiagnosticService.error('Critical startup recovery failed', error)
    throw error
  }

  DiagnosticService.checkpoint('First-render infrastructure ready')
  void (async () => {
    try {
      // Trip lifecycle and canonical work records are persisted by the work
      // lifecycle; startup does not collect or recover continuous movement traces.
      await BackupService.maybeDailyLocalBackup()
      DiagnosticService.checkpoint('Local backup lifecycle scheduled')
    } catch (error) {
      DiagnosticService.error('Local backup deferred', error)
      console.warn('KFE local backup deferred:', error)
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
