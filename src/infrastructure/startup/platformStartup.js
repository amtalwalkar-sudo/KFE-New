import { initializeCanonicalStorage } from '../../utils/indexedDB.js'

export const PlatformStartup = Object.freeze({
  initializeStorage: () => initializeCanonicalStorage(),
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null
    try { return await navigator.serviceWorker.register('./service-worker.js', { scope: './' }) }
    catch (error) { console.warn('KFE service worker registration unavailable:', error); return null }
  },
})
