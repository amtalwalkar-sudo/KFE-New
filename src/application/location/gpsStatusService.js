const listeners = new Set()

let state = 'checking'
let refreshTimer = null

const labels = {
  connected: 'GPS connected',
  permission: 'GPS permission needed',
  unsupported: 'GPS unavailable',
  unavailable: 'GPS unavailable',
  ready: 'GPS ready — tap to check',
  checking: 'Connecting GPS'
}

function publish(nextState) {
  state = nextState
  listeners.forEach(listener => listener(state))
}

export function getGpsState() {
  return state
}

export function getGpsStateLabel() {
  return labels[state] || labels.checking
}

export function subscribeGpsStatus(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function checkGps({ requestPermission = false } = {}) {
  if (!('geolocation' in navigator)) {
    publish('unsupported')
    return 'unsupported'
  }

  if (!requestPermission && 'permissions' in navigator && typeof navigator.permissions.query === 'function') {
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' })
      if (permission.state === 'denied') {
        publish('permission')
        return 'permission'
      }
      if (permission.state === 'prompt') {
        publish('ready')
        return 'ready'
      }
    } catch {
      // Fall through to a non-blocking position check.
    }
  }

  publish('checking')

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      () => {
        publish('connected')
        resolve('connected')
      },
      error => {
        const next = error.code === 1 ? 'permission' : 'unavailable'
        publish(next)
        resolve(next)
      },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
    )
  })
}

export function startGpsStatusMonitoring() {
  if (refreshTimer !== null) return stopGpsStatusMonitoring

  void checkGps()
  refreshTimer = window.setInterval(() => { void checkGps() }, 60000)
  return stopGpsStatusMonitoring
}

export function stopGpsStatusMonitoring() {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
}
