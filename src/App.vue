<script setup>
import { ref, onMounted } from 'vue'
import KfeShell from './components/shell/KfeShell.vue'
import { StartupService, startupState } from './application/startup/startupService.js'
import FirstRunSetupView from './views/FirstRunSetupView.vue'
import { permissionGateState, retryStartupPermissionGate } from './application/startup/permissionGate.js'
import { FirstRunSetupService } from './application/setup/firstRunSetupService.js'

const renderError = ref(null)
const firstRunRequired = ref(false)
const firstRunSetupEnabled = import.meta.env.VITE_ENABLE_FIRST_RUN_SETUP === 'true'
onMounted(async () => {
  if (!firstRunSetupEnabled) return
  try { firstRunRequired.value = await FirstRunSetupService.isFirstRunSetupRequired() } catch (_) { firstRunRequired.value = false }
})
const finishFirstRun = () => { firstRunRequired.value = false }
const recoverApp = () => {
  renderError.value = null
  void StartupService.resetStartupAttempt().catch(error => console.error('KFE startup retry failed:', error))
}
</script>

<template>
  <KfeShell>
    <div v-if="permissionGateState.status !== 'ready'" class="kfe-permission-gate" role="dialog" aria-modal="true" aria-live="polite" style="position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--kfe-bg,#101820);color:var(--kfe-text,#fff)">
      <div style="width:min(100%,420px);padding:24px;border-radius:16px;background:var(--kfe-surface,#1d2935);box-shadow:0 12px 40px #0005">
        <strong>{{ permissionGateState.status === 'checking' ? 'Checking phone permissions' : 'Permission required to continue' }}</strong>
        <p style="margin:12px 0 20px">{{ permissionGateState.message }}</p>
        <button v-if="permissionGateState.status === 'blocked'" type="button" @click="retryStartupPermissionGate" style="width:100%;min-height:48px">{{ permissionGateState.actionLabel || 'Open setting' }}</button>
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

    <FirstRunSetupView v-if="permissionGateState.status === 'ready' && firstRunRequired" @complete="finishFirstRun" />

    <router-view v-else-if="permissionGateState.status === 'ready'" v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
  </KfeShell>
</template>
