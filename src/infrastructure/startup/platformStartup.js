import { initializeCanonicalStorage } from '../../utils/indexedDB.js'

export const PlatformStartup = Object.freeze({
  initializeStorage: () => initializeCanonicalStorage(),
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      if (registration.waiting) registration.waiting.postMessage({ type: 'kfe:activate-update' })
      registration.update().catch(() => {})
      return registration
    } catch (error) { console.warn('KFE service worker registration unavailable:', error); return null }
  },
})
