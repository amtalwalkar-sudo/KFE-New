<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { GpsPermissionService } from '../../application/location/gpsPermissionService.js'
const isNative = GpsPermissionService.isNativePlatform()
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
    if (isNative && typeof GpsPermissionService.getStatus === 'function') {
      const result = await GpsPermissionService.getStatus()
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
  try { await GpsPermissionService.openBackgroundSettings() } catch (e) {
    error.value = e?.message || 'Could not open Android permission settings.'
  }
}

async function enableBackgroundCapture() {
  if (!isNative || busy.value) return
  busy.value = true
  error.value = ''
  try {
    let current = await GpsPermissionService.getStatus()
    if (!current.fineGranted) {
      await GpsPermissionService.requestForegroundPermissions()
      current = await GpsPermissionService.getStatus()
    }
    if (current.fineGranted && !current.backgroundGranted) {
      await GpsPermissionService.requestBackgroundPermission()
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


