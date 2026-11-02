import { WorkRuntimePorts } from '../work/workRuntimePorts.js'
import { findFirstMissingNativeCheck } from './permissionStartupChecks.js'

const native = () => { try { return WorkRuntimePorts.platform.getPlatform() !== 'web' } catch (_) { return false } }
const attempted = new Set()
const runtimeRequested = new Set()
let activeRun = null
let retryCurrent = null

export const permissionGateState = { status: 'checking', current: null, message: 'KFE is checking the settings needed for the floating work controls.', actionLabel: 'Open setting', error: null }
const permissionGateListeners = new Set()
const updatePermissionGateState = patch => {
  Object.assign(permissionGateState, patch)
  for (const listener of permissionGateListeners) listener({ ...permissionGateState })
}
export const subscribePermissionGateState = listener => {
  if (typeof listener !== 'function') throw new TypeError('Permission gate state listener must be a function.')
  permissionGateListeners.add(listener)
  listener({ ...permissionGateState })
  return () => permissionGateListeners.delete(listener)
}

const confirmedOemSettings = new Set()
let confirmedOemSettingsLoaded = false
async function loadConfirmedOemSettings() {
  if (confirmedOemSettingsLoaded) return
  const stored = await WorkRuntimePorts.platform.getConfirmedOemSettings()
  for (const key of stored || []) if (key === 'oemAutostart' || key === 'oemBattery') confirmedOemSettings.add(key)
  confirmedOemSettingsLoaded = true
}
async function persistConfirmedOemSettings() {
  await WorkRuntimePorts.platform.saveConfirmedOemSettings([...confirmedOemSettings])
}

async function getFirstMissing() {
  if (native()) {
    await loadConfirmedOemSettings()
    const status = await WorkRuntimePorts.platform.getStartupPermissionStatus()
    return findFirstMissingNativeCheck(status, confirmedOemSettings)
  }
  return null
}
function waitForRetry() { return new Promise(resolve => { retryCurrent = resolve }) }
export async function retryStartupPermissionGate() {
  if (permissionGateState.current?.key) attempted.delete(permissionGateState.current.key)
  if (permissionGateState.current?.manualConfirmation) { confirmedOemSettings.add(permissionGateState.current.key); await persistConfirmedOemSettings() }
  const resolve = retryCurrent; retryCurrent = null
  if (resolve) resolve(); else if (!activeRun) void runStartupPermissionGate()
}
export function runStartupPermissionGate() {
  if (activeRun) return activeRun
  activeRun = (async () => {
    updatePermissionGateState({ status: 'checking', error: null })
    while (true) {
      let missing
      try { missing = await getFirstMissing() } catch (error) {
        updatePermissionGateState({ status: 'blocked', error: error?.message || String(error), current: { key: 'unknown', label: 'Required phone setting' }, message: 'KFE could not verify the required phone settings. Check the permissions, then retry.', actionLabel: 'Check again' }); await waitForRetry(); updatePermissionGateState({ status: 'checking' }); continue
      }
      if (!missing) { updatePermissionGateState({ status: 'ready', current: null, message: '' }); return true }
      updatePermissionGateState({ current: missing, message: missing.message, actionLabel: missing.actionLabel || 'Open setting' })
      if (!attempted.has(missing.key)) {
        attempted.add(missing.key)
        if (native() && missing.request && !runtimeRequested.has(missing.key)) { runtimeRequested.add(missing.key); updatePermissionGateState({ status: 'checking' }); try { await WorkRuntimePorts.platform.requestStartupPermission({ permission: missing.request }) } catch (_) {} continue }
        if (native()) {
          updatePermissionGateState({ status: 'checking' }); const returned = WorkRuntimePorts.platform.waitForForegroundReturn()
          try { await WorkRuntimePorts.platform.openStartupSetting({ setting: missing.setting }) } catch (error) { updatePermissionGateState({ error: error?.message || String(error) }) }
          await returned; continue
        }
      }
      updatePermissionGateState({ status: 'blocked', message: missing.message, actionLabel: missing.actionLabel || 'Open setting' })
      await waitForRetry(); updatePermissionGateState({ status: 'checking' })
    }
  })().finally(() => { activeRun = null })
  return activeRun
}
