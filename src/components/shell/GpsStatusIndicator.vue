<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeGps = registerPlugin('KfeTripBoundaryLocation')
const isNative = Capacitor?.isNativePlatform?.() === true
const open = ref(false)
const busy = ref(false)
const error = ref('')
const status = ref({
  checking: true,
  fineGranted: false,
  coarseGranted: false,
  backgroundGranted: false,
  gpsEnabled: false,
  pendingCount: 0,
})

const state = computed(() => {
  if (status.value.checking) return { key: 'checking', label: 'Checking GPS permissions', icon: '…' }
  if (!isNative) return { key: 'browser', label: 'Background GPS is unavailable in this browser', icon: '!' }
  if (!status.value.fineGranted) return { key: 'permission', label: 'Precise location permission required', icon: '!' }
  if (!status.value.backgroundGranted) return { key: 'background-permission', label: status.value.pendingCount ? 'Background permission required · event locations pending' : 'Background location permission required', icon: '!' }
  if (status.value.pendingCount > 0 && !status.value.gpsEnabled) return { key: 'waiting', label: 'Event locations pending · GPS unavailable', icon: '…' }
  if (status.value.pendingCount > 0) return { key: 'waiting', label: 'Retrying ' + status.value.pendingCount + ' pending event location' + (status.value.pendingCount === 1 ? '' : 's'), icon: '…' }
  if (!status.value.gpsEnabled) return { key: 'unavailable', label: 'GPS is switched off or unavailable', icon: '!' }
  return { key: 'ready', label: 'GPS permissions ready for background capture', icon: '✓' }
})

async function refresh() {
  status.value.checking = true
  error.value = ''
  try {
    if (isNative && typeof NativeGps.getLocationStatus === 'function') {
      const result = await NativeGps.getLocationStatus()
      status.value = { checking: false, pendingCount: 0, ...result }
    } else {
      status.value = { checking: false, fineGranted: false, coarseGranted: false, backgroundGranted: false, gpsEnabled: false, pendingCount: 0 }
    }
  } catch (e) {
    status.value.checking = false
    error.value = e?.message || 'KFE could not verify location permissions.'
  }
}

async function openAndroidPermissionSettings() {
  try { await NativeGps.openBackgroundLocationSettings() } catch (e) {
    error.value = e?.message || 'Could not open Android permission settings.'
  }
}

async function enableBackgroundCapture() {
  if (!isNative || busy.value) return
  busy.value = true
  error.value = ''
  try {
    let current = await NativeGps.getLocationStatus()
    if (!current.fineGranted) {
      await NativeGps.requestLocationPermissions()
      current = await NativeGps.getLocationStatus()
    }
    if (current.fineGranted && !current.backgroundGranted) {
      await NativeGps.requestBackgroundLocationPermission()
    }
    await refresh()
  } catch (e) {
    error.value = e?.message || 'Permission was not granted. Background GPS capture remains disabled.'
    await refresh()
  } finally {
    busy.value = false
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') void refresh()
}
onMounted(() => {
  void refresh()
  window.addEventListener('focus', refresh)
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', refresh)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div class="gps-status">
    <button
      class="gps-status__trigger"
      type="button"
      :class="'gps-status__trigger--' + state.key"
      :aria-expanded="open ? 'true' : 'false'"
      aria-controls="kfe-gps-status-panel"
      :aria-label="'GPS status: ' + state.label"
      @click="open = !open; if (open) refresh()"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v2m0 14v2M3 12h2m14 0h2" />
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
      <span class="gps-status__dot" aria-hidden="true"></span>
    </button>

    <section v-if="open" id="kfe-gps-status-panel" class="gps-status__panel" role="dialog" aria-label="GPS status">
      <div class="gps-status__title">GPS status</div>
      <p class="gps-status__state" :data-state="state.key">{{ state.label }}</p>
      <ul class="gps-status__details">
        <li><span>Precise location</span><strong>{{ status.fineGranted ? 'Granted' : 'Not granted' }}</strong></li>
        <li><span>Background location</span><strong>{{ status.backgroundGranted ? 'Granted' : 'Not granted' }}</strong></li>
        <li><span>GPS provider</span><strong>{{ status.gpsEnabled ? 'Available' : 'Unavailable / unknown' }}</strong></li>
        <li><span>Pending event locations</span><strong>{{ status.pendingCount || 0 }}</strong></li>
      </ul>
      <p v-if="!isNative" class="gps-status__hint">Open KFE in its Android app to use permission-gated background GPS capture.</p>
      <p v-if="error" class="gps-status__error" role="alert">{{ error }}</p>
      <button
        v-if="isNative && status.fineGranted && !status.backgroundGranted"
        class="gps-status__action"
        type="button"
        @click="openAndroidPermissionSettings"
      >Open Android permission settings</button>
      <button
        v-if="isNative && (!status.fineGranted || !status.backgroundGranted)"
        class="gps-status__action"
        type="button"
        :disabled="busy"
        @click="enableBackgroundCapture"
      >{{ busy ? 'Checking permission…' : 'Enable background GPS' }}</button>
      <button class="gps-status__close" type="button" @click="open = false">Close</button>
    </section>
  </div>
</template>

<style scoped>
.gps-status{position:relative;display:flex;align-items:center}
.gps-status__trigger{position:relative;display:grid;place-items:center;width:42px;height:42px;border:1px solid var(--kfe-border, var(--kfe-base-border));border-radius:50%;background:var(--kfe-surface, var(--kfe-base-surface));color:var(--kfe-text, var(--kfe-base-text));cursor:pointer}
.gps-status__trigger svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.gps-status__dot{position:absolute;right:2px;bottom:2px;width:9px;height:9px;border:2px solid var(--kfe-surface, var(--kfe-base-surface));border-radius:50%;background:var(--kfe-warning,var(--kfe-base-accent))}
.gps-status__trigger--ready .gps-status__dot{background:var(--kfe-base-success)}
.gps-status__trigger--permission .gps-status__dot,.gps-status__trigger--background-permission .gps-status__dot,.gps-status__trigger--browser .gps-status__dot{background:var(--kfe-base-danger)}
.gps-status__trigger--waiting .gps-status__dot{background:var(--kfe-warning,var(--kfe-base-accent))}
.gps-status__panel{position:absolute;z-index:1000;top:calc(100% + 10px);right:0;width:min(320px,calc(100vw - 32px));padding:16px;border:1px solid var(--kfe-border,var(--kfe-base-border));border-radius:14px;background:var(--kfe-surface,var(--kfe-base-surface));color:var(--kfe-text,var(--kfe-base-text));box-shadow:0 12px 36px color-mix(in srgb,var(--kfe-ui-text) 32%,transparent)}
.gps-status__title{font-size:15px;font-weight:700}
.gps-status__state{margin:8px 0 12px;font-weight:600}
.gps-status__state[data-state=ready]{color:var(--kfe-base-success)}
.gps-status__state[data-state=permission],.gps-status__state[data-state=background-permission],.gps-status__state[data-state=unavailable],.gps-status__state[data-state=browser]{color:var(--kfe-base-danger)}
.gps-status__details{display:grid;gap:8px;margin:0;padding:0;list-style:none;font-size:13px}
.gps-status__details li{display:flex;justify-content:space-between;gap:12px}
.gps-status__details strong{font-weight:600;text-align:right}
.gps-status__hint,.gps-status__error{font-size:12px;line-height:1.45}
.gps-status__error{color:var(--kfe-base-danger)}
.gps-status__action,.gps-status__close{width:100%;min-height:40px;margin-top:10px;border:1px solid var(--kfe-border,var(--kfe-base-border));border-radius:9px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.gps-status__action{background:var(--kfe-accent,var(--kfe-base-accent));border-color:transparent;color:var(--kfe-ui-on-accent,var(--kfe-base-text))}
.gps-status__action:disabled{opacity:.65;cursor:wait}
</style>
