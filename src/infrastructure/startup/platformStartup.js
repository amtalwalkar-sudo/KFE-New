import { Capacitor, NativePlugins } from '../capacitor/nativePluginRegistry.js'
import { initializeCanonicalStorage } from '../../utils/indexedDB.js'

const NativeGate = NativePlugins.system
const OEM_CONFIRMATIONS_KEY = 'kfe.startup.oemSettingsConfirmed.v1'

const getConfirmedOemSettings = () => {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(OEM_CONFIRMATIONS_KEY) || '[]')
    return Array.isArray(stored) ? stored.filter(key => key === 'oemAutostart' || key === 'oemBattery') : []
  } catch (_) { return [] }
}
const saveConfirmedOemSettings = values => {
  try {
    const safe = Array.isArray(values) ? values.filter(key => key === 'oemAutostart' || key === 'oemBattery') : []
    globalThis.localStorage?.setItem(OEM_CONFIRMATIONS_KEY, JSON.stringify(safe))
    return true
  } catch (_) { return false }
}
const waitForForegroundReturn = () => new Promise(resolve => {
  let leftApp = false, settled = false
  const cleanup = () => {
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisibility)
    clearTimeout(timeout)
  }
  const finish = () => { if (settled) return; settled = true; cleanup(); resolve() }
  const onBlur = () => { leftApp = true }
  const onFocus = () => { if (leftApp) finish() }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') leftApp = true
    else if (leftApp && document.visibilityState === 'visible') finish()
  }
  const timeout = setTimeout(finish, 120000)
  window.addEventListener('blur', onBlur)
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisibility)
})

const getWebAppBase = () => {
  if (typeof window === 'undefined') return '/'
  return window.location.pathname === '/KFE-New'
    || window.location.pathname.startsWith('/KFE-New/')
    ? '/KFE-New/'
    : '/'
}

export const PlatformStartup = Object.freeze({
  getPlatform: () => Capacitor.getPlatform(),
  getStartupPermissionStatus: () => NativeGate.getStartupPermissionStatus(),
  requestStartupPermission: args => NativeGate.requestStartupPermission(args),
  openStartupSetting: args => NativeGate.openStartupSetting(args),
  getConfirmedOemSettings,
  saveConfirmedOemSettings,
  waitForForegroundReturn,
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
