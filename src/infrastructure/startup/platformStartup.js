import { Capacitor } from '@capacitor/core'
import { initializeCanonicalStorage } from '../../utils/indexedDB.js'

const getWebAppBase = () => {
  if (typeof window === 'undefined') return '/'
  return window.location.pathname === '/KFE-New'
    || window.location.pathname.startsWith('/KFE-New/')
    ? '/KFE-New/'
    : '/'
}

export const PlatformStartup = Object.freeze({
  initializeStorage: () => initializeCanonicalStorage(),
  async registerServiceWorker() {
    if (Capacitor.isNativePlatform()) return null
    if (!('serviceWorker' in navigator)) return null
    const base = getWebAppBase()
    try {
      const registration = await navigator.serviceWorker.register(`${base}service-worker.js`, { scope: base, updateViaCache: 'none' })
      if (registration.waiting) registration.waiting.postMessage({ type: 'kfe:activate-update' })
      registration.update().catch(() => {})
      return registration
    } catch (error) { console.warn('KFE service worker registration unavailable:', error); return null }
  },
})
