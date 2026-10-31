import { reactive, onUnmounted } from 'vue'
import { subscribeStartupState } from '../../application/startup/startupService.js'
import { subscribePermissionGateState } from '../../application/startup/permissionGate.js'

export function useStartupUiState() {
  const startupState = reactive({ status: 'starting', error: null, elapsedMs: 0 })
  const permissionGateState = reactive({
    status: 'checking',
    current: null,
    message: 'KFE is checking the settings needed for the floating work controls.',
    actionLabel: 'Open setting',
    error: null,
  })
  const stopStartup = subscribeStartupState(next => Object.assign(startupState, next))
  const stopPermissionGate = subscribePermissionGateState(next => Object.assign(permissionGateState, next))
  onUnmounted(() => {
    stopStartup()
    stopPermissionGate()
  })
  return { startupState, permissionGateState }
}
