<script setup>
import { ref } from 'vue'
import DiagnosticBubble from './components/DiagnosticBubble.vue'
import KfeShell from './components/shell/KfeShell.vue'

const props = defineProps({ startupError: { type: String, default: null } })
const renderError = ref(null)
const recoverApp = () => { renderError.value = null; window.location.reload() }
</script>

<template>
  <KfeShell>
    <div v-if="renderError" class="error-container" role="alert">
      <h3>Something went wrong</h3>
      <p>{{ renderError }}</p>
      <button @click="recoverApp" class="retry-btn">Reload Application</button>
    </div>
    <div v-else-if="props.startupError" class="error-container" role="alert">
      <h3>Application initialization failed</h3>
      <p>{{ props.startupError }}</p>
      <button @click="recoverApp" class="retry-btn">Retry Initialization</button>
    </div>
    <router-view v-else v-slot="{ Component }"><keep-alive><component :is="Component" /></keep-alive></router-view>
  </KfeShell>
</template>
