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
    <div v-else-if="startupState.status === 'error'" class="error-container kfe-runtime-error" role="alert">
      <h3>KFE could not start</h3>
      <p>{{ startupState.error }}</p>
      <p>Startup is protected by a bounded recovery path. Your stored data is not cleared.</p>
      <button @click="recoverApp" class="retry-btn">Retry Initialization</button>
    </div>
    <div v-else-if="startupState.status !== 'ready'" class="error-container kfe-runtime-error" role="status" aria-live="polite">
      <h3>Starting KFE…</h3>
      <p>Preparing local storage. The KFE interface is already mounted.</p>
      <p v-if="startupState.elapsedMs > 4000">Still working…</p>
    </div>
    <router-view v-else v-slot="{ Component }"><keep-alive><component :is="Component" /></keep-alive></router-view>
  </KfeShell>
</template>
