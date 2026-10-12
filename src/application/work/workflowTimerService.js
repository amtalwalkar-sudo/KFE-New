const STORAGE_KEY = 'kfe.work.workflow-timer.v1'

const read = () => {
  try {
    if (typeof localStorage === 'undefined') return null
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return value && typeof value.identity === 'string' && Number.isFinite(value.startedAt) ? value : null
  } catch (_) {
    return null
  }
}

export const WorkflowTimerService = Object.freeze({
  enter(identity, now = Date.now()) {
    const normalizedIdentity = String(identity || '')
    const previous = read()
    if (normalizedIdentity && previous?.identity === normalizedIdentity) return previous.startedAt
    const startedAt = Number.isFinite(Number(now)) ? Number(now) : Date.now()
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ identity: normalizedIdentity, startedAt }))
      }
    } catch (_) {}
    return startedAt
  },
  clear() {
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY) } catch (_) {}
  }
})
