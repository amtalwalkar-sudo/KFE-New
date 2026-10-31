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
  ] = await Promise.all([
    import('../../repositories/mutationRepository.js'),
    import('../backup/backupService.js'),
  ])

  void platform.registerServiceWorker()
    .catch(error => {
      console.warn('KFE service worker registration unavailable:', error)
    })

  try {
    await platform.initializeStorage()
    // A pending reset must finish before stale outbox/create-intent work can replay.
    await BackupService.recoverPendingReset()
    // A restore journal may represent a process death between SQLite and
    // IndexedDB. Finish the same idempotent restore before replaying mutations.
    await BackupService.recoverPendingRestore()
    await MutationRepository.recoverStaleSyncing()
  } catch (error) {
    throw error
  }

  void (async () => {
    try {
      // Trip lifecycle and canonical work records are persisted by the work
      // lifecycle; startup does not collect or recover continuous movement traces.
      await BackupService.maybeDailyLocalBackup()
    } catch (error) {
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
