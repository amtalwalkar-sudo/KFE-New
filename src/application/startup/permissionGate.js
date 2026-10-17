import { reactive } from 'vue'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { findFirstMissingNativeCheck } from './permissionStartupChecks.js'

const NativeGate = registerPlugin('KfeNativeGps')
const native = () => Capacitor?.isNativePlatform?.() === true
const attempted = new Set()
const runtimeRequested = new Set()
let activeRun = null
let retryCurrent = null

export const permissionGateState = reactive({ status: 'checking', current: null, message: 'KFE is checking the permissions needed to record a shift safely.', actionLabel: 'Open setting', error: null })

const OEM_CONFIRMATIONS_KEY = 'kfe.startup.oemSettingsConfirmed.v1'

function loadConfirmedOemSettings() {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(OEM_CONFIRMATIONS_KEY) || '[]')
    return Array.isArray(stored) ? stored.filter(key => key === 'oemAutostart' || key === 'oemBattery') : []
  } catch (_) { return [] }
}
const confirmedOemSettings = new Set(loadConfirmedOemSettings())
function persistConfirmedOemSettings() {
  try { globalThis.localStorage?.setItem(OEM_CONFIRMATIONS_KEY, JSON.stringify([...confirmedOemSettings])) } catch (_) {}
}


function waitForForegroundReturn() {
  return new Promise(resolve => {
    let leftApp = false, settled = false
    const cleanup = () => { window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); clearTimeout(timeout) }
    const finish = () => { if (settled) return; settled = true; cleanup(); resolve() }
    const onBlur = () => { leftApp = true }
    const onFocus = () => { if (leftApp) finish() }
    const onVisibility = () => { if (document.visibilityState === 'hidden') leftApp = true; else if (leftApp && document.visibilityState === 'visible') finish() }
    const timeout = setTimeout(finish, 120000)
    window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onVisibility)
  })
}

async function browserLocationPermission() {
  if (!globalThis.navigator?.geolocation) return 'denied'
  try { if (navigator.permissions?.query) { const result = await navigator.permissions.query({ name: 'geolocation' }); return result.state } } catch (_) {}
  return 'prompt'
}
function requestBrowserLocation() {
  return new Promise(resolve => {
    if (!navigator?.geolocation) { resolve(false); return }
    navigator.geolocation.getCurrentPosition(() => resolve(true), error => resolve(error?.code !== 1), { enableHighAccuracy: false, maximumAge: 0, timeout: 8000 })
  })
}
async function getFirstMissing() {
  if (native()) { const status = await NativeGate.getStartupPermissionStatus(); return findFirstMissingNativeCheck(status, confirmedOemSettings) }
  const state = await browserLocationPermission()
  if (state === 'denied') return { key: 'location', label: 'Location permission', setting: 'location', message: 'Allow location for this site in your browser or phone settings, then return to KFE.', actionLabel: 'Check again', browserDenied: true }
  if (state === 'prompt') return { key: 'location', label: 'Location permission', setting: 'location', message: 'Allow location when your browser asks so KFE can record trip distance.', actionLabel: 'Request location' }
  return null
}
function waitForRetry() { return new Promise(resolve => { retryCurrent = resolve }) }
export function retryStartupPermissionGate() {
  if (permissionGateState.current?.key) attempted.delete(permissionGateState.current.key)
  if (permissionGateState.current?.manualConfirmation) { confirmedOemSettings.add(permissionGateState.current.key); persistConfirmedOemSettings() }
  const resolve = retryCurrent; retryCurrent = null
  if (resolve) resolve(); else if (!activeRun) void runStartupPermissionGate()
}
export function runStartupPermissionGate() {
  if (activeRun) return activeRun
  activeRun = (async () => {
    permissionGateState.status = 'checking'; permissionGateState.error = null
    while (true) {
      let missing
      try { missing = await getFirstMissing() } catch (error) {
        permissionGateState.status = 'blocked'; permissionGateState.error = error?.message || String(error); permissionGateState.current = { key: 'unknown', label: 'Required phone setting' }; permissionGateState.message = 'KFE could not verify the required phone settings. Check the permissions, then retry.'; permissionGateState.actionLabel = 'Check again'; await waitForRetry(); permissionGateState.status = 'checking'; continue
      }
      if (!missing) { permissionGateState.status = 'ready'; permissionGateState.current = null; permissionGateState.message = ''; return true }
      permissionGateState.current = missing; permissionGateState.message = missing.message; permissionGateState.actionLabel = missing.actionLabel || 'Open setting'
      if (!attempted.has(missing.key)) {
        attempted.add(missing.key)
        if (!native() && missing.key === 'location' && !missing.browserDenied) { permissionGateState.status = 'checking'; await requestBrowserLocation(); continue }
        if (native() && missing.request && !runtimeRequested.has(missing.key)) { runtimeRequested.add(missing.key); permissionGateState.status = 'checking'; try { await NativeGate.requestStartupPermission({ permission: missing.request }) } catch (_) {} continue }
        if (native()) {
          permissionGateState.status = 'checking'; const returned = waitForForegroundReturn()
          try { await NativeGate.openStartupSetting({ setting: missing.setting }) } catch (error) { permissionGateState.error = error?.message || String(error) }
          await returned; continue
        }
      }
      permissionGateState.status = 'blocked'; permissionGateState.message = missing.message; permissionGateState.actionLabel = missing.actionLabel || 'Open setting'
      await waitForRetry(); permissionGateState.status = 'checking'
    }
  })().finally(() => { activeRun = null })
  return activeRun
}
