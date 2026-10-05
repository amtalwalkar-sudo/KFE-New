<script setup>
import { useRegisterSW } from 'virtual:pwa-register/vue'

const {
  offlineReady,
  needRefresh,
  updateServiceWorker,
} = useRegisterSW()

async function close() {
  offlineReady.value = false
  needRefresh.value = false
}
</script>

<template>
  <div v-if="offlineReady || needRefresh" class="pwa-toast-banner" role="alert">
    <div class="message">
      <span v-if="offlineReady">
        App ready to work offline
      </span>
      <span v-else>
        New update available, click on reload button to update.
      </span>
    </div>
    <div class="actions">
      <button v-if="needRefresh" @click="updateServiceWorker()" class="pwa-btn pwa-reload">
        Reload
      </button>
      <button @click="close" class="pwa-btn pwa-close">
        Close
      </button>
    </div>
  </div>
</template>

<style scoped>
.pwa-toast-banner {
  position: fixed;
  right: 0;
  bottom: 0;
  margin: 16px;
  padding: 12px;
  border: 1px solid var(--kfe-ui-border);
  border-radius: var(--kfe-radius-md);
  z-index: 1000;
  text-align: left;
  box-shadow: var(--kfe-ui-shadow);
  background-color: var(--kfe-ui-surface);
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 300px;
}
.message {
  font-size: .85rem;
  color: var(--kfe-ui-text);
}
.actions {
  display: flex;
  gap: 8px;
}
.pwa-btn {
  padding: 6px 12px;
  border-radius: var(--kfe-radius-sm);
  border: none;
  font-size: .75rem;
  cursor: pointer;
  font-weight: 600;
}
.pwa-reload {
  background-color: var(--kfe-ui-accent);
  color:var(--kfe-on-accent);
}
.pwa-close {
  background-color: var(--kfe-ui-surface-2);
  color: var(--kfe-muted-text);
}
</style>
