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

