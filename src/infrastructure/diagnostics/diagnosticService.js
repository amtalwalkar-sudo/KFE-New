const MAX_ENTRIES = 40

let operation = null
let entries = []
const listeners = new Set()

const emit = () => {
  const snapshot = DiagnosticService.snapshot()
  listeners.forEach(listener => {
    try { listener(snapshot) } catch (_) {}
  })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kfe:diagnostic-update', { detail: snapshot }))
  }
}

const normalizeError = error => ({
  message: error?.message || String(error || 'Unknown error'),
  name: error?.name || 'Error',
  stack: error?.stack || null
})

const push = (status, step, detail = '', error = null) => {
  const entry = {
    at: new Date().toISOString(),
    status,
    step,
    detail: detail || '',
    error: error ? normalizeError(error) : null
  }
  entries = [...entries, entry].slice(-MAX_ENTRIES)
  emit()
  return entry
}

export const DiagnosticService = {
  start(name) {
    operation = name
    entries = []
    push('RUNNING', name, 'Started')
  },

  waiting(step, detail = '') {
    return push('WAITING', step, detail)
  },

  checkpoint(step, detail = '') {
    return push('OK', step, detail)
  },

  error(step, error, detail = '') {
    return push('ERROR', step, detail, error)
  },

  complete(step = 'Complete', detail = '') {
    return push('COMPLETE', step, detail)
  },

  snapshot() {
    return {
      operation,
      entries: [...entries],
      current: entries[entries.length - 1] || null,
      updatedAt: new Date().toISOString()
    }
  },

  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  clear() {
    operation = null
    entries = []
    emit()
  }
}
