/**
 * App-wide, event-driven connectivity hints for network-dependent features.
 *
 * This browser/WebView adapter deliberately does not probe the internet or poll.
 * navigator.onLine is only a network hint: online does not prove that a remote
 * service is reachable. Consumers must handle request failures and own durable,
 * feature-specific retry policy. Offline-first writes must never depend on this
 * service or on an internet connection.
 */
const subscribers = new Set()
let listenersInstalled = false

const readStatus = () => {
  const networkAvailable = typeof globalThis.navigator === 'undefined'
    ? true
    : globalThis.navigator.onLine !== false
  return Object.freeze({
    networkAvailable,
    // The browser API cannot distinguish validated internet from a captive portal.
    internetAvailable: networkAvailable ? null : false,
    state: networkAvailable ? 'unknown' : 'offline',
    source: 'browser-network-hint',
  })
}

let latestStatus = readStatus()

const notify = reason => {
  latestStatus = readStatus()
  for (const subscriber of [...subscribers]) {
    try { subscriber(latestStatus, reason) }
    catch (error) { console.warn('Connectivity subscriber failed:', error) }
  }
}

const installListeners = () => {
  if (listenersInstalled || typeof globalThis.addEventListener !== 'function') return
  listenersInstalled = true
  globalThis.addEventListener('online', () => notify('online'))
  globalThis.addEventListener('offline', () => notify('offline'))
  globalThis.addEventListener('pageshow', () => notify('resume'))
  if (typeof globalThis.document?.addEventListener === 'function') {
    globalThis.document.addEventListener('visibilitychange', () => {
      if (globalThis.document.visibilityState === 'visible') notify('foreground')
    })
  }
}

export const ConnectivityService = Object.freeze({
  getStatus() {
    latestStatus = readStatus()
    return latestStatus
  },
  isNetworkAvailable() {
    return readStatus().networkAvailable
  },
  /**
   * Subscribe to network and app-lifecycle changes. The returned function
   * removes the listener; no timers, fetch probes, or background polling run.
   */
  subscribe(listener, { emitCurrent = true } = {}) {
    if (typeof listener !== 'function') throw new TypeError('Connectivity subscriber must be a function')
    installListeners()
    subscribers.add(listener)
    if (emitCurrent) listener(this.getStatus(), 'initial')
    return () => subscribers.delete(listener)
  },
})
