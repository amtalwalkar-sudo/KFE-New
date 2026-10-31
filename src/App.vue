<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import KfeShell from './components/shell/KfeShell.vue'
import { StartupService, startupState } from './application/startup/startupService.js'
import { permissionGateState, retryStartupPermissionGate } from './application/startup/permissionGate.js'

const renderError = ref(null)
const handleRuntimeError = event => {
  const detail = event?.detail || {}
  renderError.value = [detail.message || 'Unknown runtime error', detail.component ? 'Component: ' + detail.component : '', detail.phase ? 'Phase: ' + detail.phase : '', detail.stack].filter(Boolean).join('\\n\\n')
}
onMounted(() => window.addEventListener('kfe:runtime-error', handleRuntimeError))
onUnmounted(() => window.removeEventListener('kfe:runtime-error', handleRuntimeError))
const recoverApp = () => {
  renderError.value = null
  void StartupService.resetStartupAttempt().catch(error => console.error('KFE startup retry failed:', error))
}
</script>

<template>
  <KfeShell>
    <div v-if="permissionGateState.status !== 'ready'" class="kfe-permission-gate" role="dialog" aria-modal="true" aria-live="polite" >
      <div class="kfe-permission-gate__card">
        <strong>{{ permissionGateState.status === 'checking' ? 'Checking phone permissions' : 'Permission required to continue' }}</strong>
        <p style="margin:12px 0 20px">{{ permissionGateState.message }}</p>
        <button v-if="permissionGateState.status === 'blocked'" type="button" @click="retryStartupPermissionGate" class="kfe-permission-gate__action">{{ permissionGateState.actionLabel || 'Open setting' }}</button>
      </div>
    </div>
    <div v-if="permissionGateState.status === 'ready' && renderError" class="error-container kfe-runtime-error" role="alert">
      <h3>Something went wrong</h3>
      <p>{{ renderError }}</p>
      <button @click="recoverApp" class="retry-btn">Retry Initialization</button>
    </div>

    <div
      v-else-if="permissionGateState.status === 'ready' && startupState.status === 'error'"
      class="error-container kfe-runtime-error"
      role="status"
      aria-live="polite"
    >
      <strong>KFE startup failed to initialize safely</strong>
      <span>{{ startupState.error }}</span>
      <button @click="recoverApp" class="retry-btn">Retry Initialization</button>
    </div>

    <div
      v-else-if="permissionGateState.status === 'ready' && startupState.status === 'starting'"
      class="kfe-startup-status"
      role="status"
      aria-live="polite"
    >
      <span>Local storage is initializing in the background.</span>
    </div>

    <router-view v-if="permissionGateState.status === 'ready' && !renderError" v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
  </KfeShell>
</template>
