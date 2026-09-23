import { reactive } from 'vue'
import { StartupService } from './startupService.js'

export const startupState = reactive({
  status: 'starting',
  error: null,
  elapsedMs: 0,
})

let activeAttempt = null
let timer = null

const STARTUP_TIMEOUT_MS = 8000

const clearTimer = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export const startApplication = () => {
  if (activeAttempt) return activeAttempt

  const startedAt = Date.now()
  startupState.status = 'starting'
  startupState.error = null
  startupState.elapsedMs = 0

  timer = setInterval(() => {
    startupState.elapsedMs = Date.now() - startedAt
  }, 250)

  const operation = StartupService.initializeApplication()

  activeAttempt = operation
    .then(() => {
      clearTimer()
      startupState.elapsedMs = Date.now() - startedAt
      startupState.status = 'ready'
      return { ready: true }
    })
    .catch(error => {
      clearTimer()
      startupState.error = error?.message || 'Application initialization failed.'
      startupState.status = 'error'
      throw error
    })

  void Promise.race([
    operation,
    new Promise((_, reject) => setTimeout(() => reject(new Error('KFE startup exceeded 8 seconds. Storage initialization may be blocked.')), STARTUP_TIMEOUT_MS)),
  ]).catch(error => {
    if (startupState.status === 'starting') {
      startupState.elapsedMs = Date.now() - startedAt
      startupState.error = error?.message || 'KFE startup timed out.'
      startupState.status = 'error'
    }
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
