<script setup>
import { computed } from 'vue'
const props = defineProps({ state: { type: String, default: 'OFFLINE' } })
const meta = computed(() => ({
  OFFLINE: { label: 'Offline', cls: 'offline', symbol: '○' },
  ONLINE: { label: 'Online', cls: 'online', symbol: '●' },
  SHIFT: { label: 'On shift', cls: 'shift', symbol: '●' },
  BREAK: { label: 'Break', cls: 'break', symbol: '●' },
  BUSINESS: { label: 'Business trip', cls: 'business', symbol: '●' },
  PERSONAL: { label: 'Personal trip', cls: 'personal', symbol: 'P' },
}[props.state] || { label: 'Offline', cls: 'offline', symbol: '○' }))
</script>
<template>
  <span class="kfe-state-indicator" :class="`is-${meta.cls}`" :aria-label="meta.label" :title="meta.label">
    <span class="kfe-state-symbol" aria-hidden="true">{{ meta.symbol }}</span><span class="kfe-state-label">{{ meta.label }}</span>
  </span>
</template>
<style scoped>
.kfe-state-indicator{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:5px 8px;border:1px solid var(--kfe-ui-border);border-radius:999px;background:var(--kfe-ui-surface);font-size:.64rem;font-weight:900;white-space:nowrap}.kfe-state-symbol{font-size:.7rem;line-height:1}.kfe-state-label{color:var(--kfe-muted-text)}.is-online .kfe-state-symbol{color:var(--kfe-success)}.is-shift .kfe-state-symbol,.is-break .kfe-state-symbol{color:var(--kfe-warning)}.is-business .kfe-state-symbol{color:var(--kfe-info)}.is-personal .kfe-state-symbol{color:var(--kfe-personal)}.is-personal .kfe-state-symbol{font-size:.62rem}.is-offline .kfe-state-symbol{color:var(--kfe-muted-text)}
@media(max-width:430px){.kfe-state-label{display:none}.kfe-state-indicator{width:32px;height:32px;justify-content:center;padding:0}.kfe-state-symbol{font-size:.65rem}}
</style>