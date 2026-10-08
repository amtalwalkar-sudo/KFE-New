<script setup>
import { ref, onMounted } from 'vue'
import KfeShell from './components/shell/KfeShell.vue'
import { StartupService, startupState } from './application/startup/startupService.js'
import FirstRunSetupView from './views/FirstRunSetupView.vue'
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
    <div v-if="renderError" class="error-container kfe-runtime-error" role="alert">
      <h3>Something went wrong</h3>
      <p>{{ renderError }}</p>
      <button @click="recoverApp" class="retry-btn">Retry Initialization</button>
    </div>

    <div
      v-else-if="startupState.status === 'error'"
      class="error-container kfe-runtime-error"
      role="status"
      aria-live="polite"
    >
      <strong>KFE startup failed to initialize safely</strong>
      <span>{{ startupState.error }}</span>
      <button @click="recoverApp" class="retry-btn">Retry Initialization</button>
    </div>

    <div
      v-else-if="startupState.status === 'starting'"
      class="kfe-startup-status"
      role="status"
      aria-live="polite"
    >
      <span>Local storage is initializing in the background.</span>
    </div>

    <FirstRunSetupView v-if="firstRunRequired" @complete="finishFirstRun" />

    <router-view v-else v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
  </KfeShell>
</template>
