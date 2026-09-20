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
  <div style="position:fixed;right:14px;bottom:78px;z-index:20000;font-family:system-ui,-apple-system,sans-serif">
    <button
      @click="open=!open"
      :title="hasError ? 'Diagnostics — error captured' : 'Diagnostics'"
      :style="{width:'46px',height:'46px',borderRadius:'50%',border:'2px solid white',background:hasError?'#dc2626':'#0f172a',color:'white',boxShadow:'0 4px 14px rgba(0,0,0,.28)',fontSize:'20px',cursor:'pointer'}"
    >
      {{ hasError ? '⚠️' : '🐞' }}
    </button>

    <div v-if="open" style="position:absolute;right:0;bottom:56px;width:min(360px,calc(100vw - 28px));max-height:70vh;background:white;border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 10px 30px rgba(15,23,42,.28);overflow:hidden;color:#0f172a">
      <div style="padding:12px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">
        <div>
          <strong>Diagnostics</strong>
          <div style="font-size:.7rem;color:#64748b">{{ snapshot.operation || 'No operation recorded' }}</div>
        </div>
        <button @click="open=false" style="border:0;background:none;font-size:18px;cursor:pointer">×</button>
      </div>

      <div v-if="current" style="padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
        <div style="font-size:.7rem;color:#64748b">Current</div>
        <div style="font-weight:800;font-size:.86rem">
          {{ statusSymbol(current.status) }} {{ current.step }}
        </div>
        <div v-if="current.detail" style="font-size:.72rem;color:#64748b;margin-top:2px">{{ current.detail }}</div>
      </div>

      <div style="max-height:42vh;overflow:auto;padding:8px 12px">
        <div v-for="(entry,index) in snapshot.entries" :key="`${entry.at}-${index}`" style="padding:7px 0;border-bottom:1px solid #f1f5f9">
          <div style="display:flex;gap:6px;align-items:center;font-size:.76rem">
            <strong>{{ statusSymbol(entry.status) }}</strong>
            <span style="font-weight:700">{{ entry.step }}</span>
            <span style="margin-left:auto;color:#94a3b8;font-size:.65rem">{{ formatTime(entry.at) }}</span>
          </div>
          <div v-if="entry.detail" style="font-size:.68rem;color:#64748b;margin-left:18px">{{ entry.detail }}</div>
          <div v-if="entry.error" style="margin:4px 0 0 18px;padding:6px;background:#fef2f2;color:#991b1b;border-radius:6px;font-size:.68rem;white-space:pre-wrap;word-break:break-word">
            {{ entry.error.name }}: {{ entry.error.message }}
          </div>
        </div>
      </div>

      <div style="padding:9px 12px;border-top:1px solid #e2e8f0;display:flex;gap:7px">
        <button @click="copyDiagnostics" style="flex:1;padding:8px;border:1px solid #cbd5e1;background:white;border-radius:7px;font-size:.72rem">{{ copied ? 'Copied' : 'Copy' }}</button>
        <button @click="clearDiagnostics" style="padding:8px 10px;border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:7px;font-size:.72rem">Clear</button>
      </div>
    </div>
  </div>
</template>
