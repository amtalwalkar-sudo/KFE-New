import { setKfeThemeMode } from '../../presentation/theme/kfeThemeController.js'

const NOTIFICATIONS_KEY = 'kfe.notifications.enabled'

export const ApplicationSettingsService = Object.freeze({
  getNotificationsEnabled() {
    try { return localStorage.getItem(NOTIFICATIONS_KEY) !== 'false' }
    catch (_) { return true }
  },
  setNotificationsEnabled(enabled) {
    const value = Boolean(enabled)
    try { localStorage.setItem(NOTIFICATIONS_KEY, String(value)) } catch (_) {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kfe:notification-preference-changed', { detail: { enabled: value } }))
    }
    return value
  },
  resetPreferences() {
    const themeMode = setKfeThemeMode('auto')
    try { localStorage.removeItem(NOTIFICATIONS_KEY) } catch (_) {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kfe:notification-preference-changed', { detail: { enabled: true } }))
    }
    return { themeMode, notificationsEnabled: true }
  }
})
