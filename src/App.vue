<script setup>
import { ref } from 'vue'
import KfeShell from './components/shell/KfeShell.vue'
import { startupState } from './application/startup/startupRuntime.js'

const renderError = ref(null)
const recoverApp = () => { renderError.value = null; window.location.reload() }
</script>

<template>
  <KfeShell>
    <div v-if="renderError" class="error-container kfe-runtime-error" role="alert">
      <h3>Something went wrong</h3>
      <p>{{ renderError }}</p>
      <button @click="recoverApp" class="retry-btn">Reload Application</button>
    </div>

    <div
      v-else-if="startupState.status === 'error'"
      class="error-container kfe-runtime-error"
      role="status"
      aria-live="polite"
    >
      <strong>KFE startup is still recovering</strong>
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

    <router-view v-slot="{ Component }">
      <keep-alive><component :is="Component" /></keep-alive>
    </router-view>
  </KfeShell>
</template>
