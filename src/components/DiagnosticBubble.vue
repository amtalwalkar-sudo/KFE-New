<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { DiagnosticService } from '../infrastructure/diagnostics/diagnosticService.js'

const open = ref(false)
const snapshot = ref(DiagnosticService.snapshot())
const copied = ref(false)

const refresh = next => { snapshot.value = next || DiagnosticService.snapshot() }
const unsubscribe = ref(null)

onMounted(() => {
  unsubscribe.value = DiagnosticService.subscribe(refresh)
})

onUnmounted(() => {
  unsubscribe.value?.()
})

const current = computed(() => snapshot.value.current)
const hasError = computed(() => snapshot.value.entries.some(entry => entry.status === 'ERROR'))

const statusSymbol = status => ({
  COMPLETE: '✓',
  OK: '✓',
  RUNNING: '●',
  WAITING: '…',
  ERROR: '✕'
}[status] || '•')

const formatTime = value => value ? new Date(value).toLocaleTimeString() : ''

const diagnosticsText = computed(() => JSON.stringify(snapshot.value, null, 2))

const copyDiagnostics = async () => {
  try {
    await navigator.clipboard.writeText(diagnosticsText.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch (_) {
    copied.value = false
  }
}

const clearDiagnostics = () => {
  DiagnosticService.clear()
  open.value = false
}
</script>

<template>
  <div class="kfe-diagnostic">
    <button
      class="kfe-diagnostic-trigger"
      :class="{ 'is-error': hasError }"
      type="button"
      @click="open=!open"
      :title="hasError ? 'Diagnostics — error captured' : 'Diagnostics'"
      :aria-label="hasError ? 'Diagnostics — error captured' : 'Diagnostics'"
      :aria-expanded="open"
    >
      {{ hasError ? '⚠️' : '🐞' }}
    </button>

    <section v-if="open" class="kfe-diagnostic-panel" aria-label="Diagnostics panel">
      <header class="kfe-diagnostic-header">
        <div>
          <strong>Diagnostics</strong>
          <div class="kfe-diagnostic-subtitle">{{ snapshot.operation || 'No operation recorded' }}</div>
        </div>
        <button class="kfe-diagnostic-close" type="button" aria-label="Close diagnostics" @click="open=false">×</button>
      </header>

      <div v-if="current" class="kfe-diagnostic-current">
        <div class="kfe-diagnostic-label">Current</div>
        <div class="kfe-diagnostic-current-step">
          {{ statusSymbol(current.status) }} {{ current.step }}
        </div>
        <div v-if="current.detail" class="kfe-diagnostic-detail">{{ current.detail }}</div>
      </div>

      <div class="kfe-diagnostic-list">
        <div v-for="(entry,index) in snapshot.entries" :key="`${entry.at}-${index}`" class="kfe-diagnostic-entry">
          <div class="kfe-diagnostic-entry-head">
            <strong>{{ statusSymbol(entry.status) }}</strong>
            <span>{{ entry.step }}</span>
            <time>{{ formatTime(entry.at) }}</time>
          </div>
          <div v-if="entry.detail" class="kfe-diagnostic-entry-detail">{{ entry.detail }}</div>
          <div v-if="entry.error" class="kfe-diagnostic-error">
            {{ entry.error.name }}: {{ entry.error.message }}
          </div>
        </div>
      </div>

      <footer class="kfe-diagnostic-actions">
        <button type="button" class="kfe-secondary-action" @click="copyDiagnostics">{{ copied ? 'Copied' : 'Copy' }}</button>
        <button type="button" class="kfe-diagnostic-clear" @click="clearDiagnostics">Clear</button>
      </footer>
    </section>
  </div>
</template>
