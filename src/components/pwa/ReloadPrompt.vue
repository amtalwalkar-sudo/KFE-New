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
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: var(--radius-md, 6px);
  z-index: 1000;
  text-align: left;
  box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
  background-color: var(--bg-surface, #ffffff);
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 300px;
}
.message {
  font-size: var(--font-size-sm, 0.85rem);
  color: var(--text-main, #0f172a);
}
.actions {
  display: flex;
  gap: 8px;
}
.pwa-btn {
  padding: 6px 12px;
  border-radius: var(--radius-sm, 4px);
  border: none;
  font-size: var(--font-size-xs, 0.75rem);
  cursor: pointer;
  font-weight: 600;
}
.pwa-reload {
  background-color: var(--color-primary, #2563eb);
  color: white;
}
.pwa-close {
  background-color: var(--bg-muted, #f1f5f9);
  color: var(--text-muted, #64748b);
}
</style>
