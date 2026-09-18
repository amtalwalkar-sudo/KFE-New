<script setup>
import { ref } from 'vue'
import { useOfflineQueueStore } from '@/stores/index.js'
import { exportDatabase, importDatabase } from '@/db/backup.js'
import { useToast } from '@/composables/useToast.js'

const offlineQueueStore = useOfflineQueueStore()
const toast = useToast()
const fileInput = ref(null)
const importing = ref(false)

async function handleBackup() {
  try {
    await exportDatabase()
    toast.success('Database backup downloaded.')
  } catch (err) {
    toast.error(`Backup failed: ${err.message}`)
  }
}

function triggerRestore() {
  fileInput.value?.click()
}

async function handleFileSelect(event) {
  const file = event.target.files?.[0]
  if (!file) return

  importing.value = true
  try {
    const count = await importDatabase(file)
    toast.success(`Restored ${count} records successfully.`)
  } catch (err) {
    toast.error(`Restore failed: ${err.message}`)
  } finally {
    importing.value = false
    event.target.value = ''
  }
}
</script>

<template>
  <div class="app-layout">
    <header class="app-header">
      <div class="brand">
        <h1 class="brand-title">Kanishka Enterprises</h1>
        <span
          class="status-badge"
          :class="{ online: offlineQueueStore.isOnline, offline: !offlineQueueStore.isOnline }"
        >
          {{ offlineQueueStore.isOnline ? 'Online' : 'Offline' }}
        </span>
      </div>

      <div class="header-actions">
        <button class="hdr-btn" @click="handleBackup" title="Export Backup JSON">
          Backup
        </button>

        <button class="hdr-btn" :disabled="importing" @click="triggerRestore" title="Restore Snapshot JSON">
          {{ importing ? 'Restoring...' : 'Restore' }}
        </button>

        <input
          ref="fileInput"
          type="file"
          accept=".json"
          class="hidden-input"
          @change="handleFileSelect"
        />
      </div>
    </header>

    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-body, #f8fafc);
}
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background-color: var(--bg-surface, #ffffff);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.brand-title {
  font-size: var(--font-size-md, 1rem);
  font-weight: 700;
  color: var(--text-main, #0f172a);
  margin: 0;
}
.status-badge {
  font-size: var(--font-size-xs, 0.7rem);
  padding: 0.15rem 0.4rem;
  border-radius: 9999px;
  font-weight: 600;
}
.status-badge.online {
  background-color: #dcfce7;
  color: #166534;
}
.status-badge.offline {
  background-color: #fee2e2;
  color: #991b1b;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.hdr-btn {
  padding: 0.35rem 0.65rem;
  font-size: var(--font-size-xs, 0.75rem);
  font-weight: 600;
  border: 1px solid var(--border-color, #cbd5e1);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-surface, #ffffff);
  color: var(--text-main, #334155);
  cursor: pointer;
}
.hdr-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.hidden-input {
  display: none;
}
.app-main {
  flex: 1;
  padding: 1rem;
}
.app-layout{background:var(--kfe-ui-bg)!important;color:var(--kfe-ui-text)!important}.app-header{padding:12px 16px!important;background:var(--kfe-ui-surface)!important;border-bottom:1px solid var(--kfe-ui-border)!important;box-shadow:var(--kfe-ui-shadow)!important}.brand-title{color:var(--kfe-ui-text)!important;font-weight:900!important}.status-badge.online{background:color-mix(in srgb,var(--kfe-success) 11%,var(--kfe-ui-surface))!important;color:var(--kfe-success)!important}.status-badge.offline{background:color-mix(in srgb,var(--kfe-danger) 11%,var(--kfe-ui-surface))!important;color:var(--kfe-danger)!important}.hdr-btn{min-height:44px!important;padding:0 11px!important;border-radius:9px!important;background:var(--kfe-ui-surface)!important;border-color:var(--kfe-ui-border)!important;color:var(--kfe-ui-text)!important;font-weight:800!important}.hdr-btn:hover{border-color:var(--kfe-ui-accent)!important}.app-main{padding:16px!important}
</style>