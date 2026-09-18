<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import DiagnosticBubble from '../DiagnosticBubble.vue'

const gpsState = ref('checking')
const gpsLabel = ref('GPS')
let gpsWatchId = null

function connectGps() {
  if (!('geolocation' in navigator)) {
    gpsState.value = 'unsupported'
    return
  }

  gpsState.value = 'checking'

  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId)
  }

  gpsWatchId = navigator.geolocation.watchPosition(
    () => { gpsState.value = 'connected' },
    (error) => {
      gpsState.value = error.code === 1 ? 'permission' : 'unavailable'
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
  )
}

function gpsStateLabel() {
  if (gpsState.value === 'connected') return 'GPS connected'
  if (gpsState.value === 'permission') return 'GPS permission needed'
  if (gpsState.value === 'unsupported') return 'GPS unavailable'
  if (gpsState.value === 'unavailable') return 'GPS unavailable'
  return 'Connecting GPS'
}

onMounted(connectGps)
onBeforeUnmount(() => {
  if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId)
})
</script>

<template>
  <div class="viewport-wrapper">
    <a class="kfe-skip-link" href="#main-content">Skip to main content</a>
    <header class="top-bar" aria-label="KFE application header">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">K</div>
        <div class="brand-copy">
          <strong>Kanishka Enterprises</strong>
        </div>
      </div>

      <button
        class="header-gps"
        :class="\`is-\${gpsState}\`"
        type="button"
        :title="gpsStateLabel()"
        :aria-label="gpsStateLabel()"
        @click="connectGps"
      >
        <svg class="gps-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="2.1" fill="currentColor"/>
        </svg>
        <span>{{ gpsLabel }}</span>
      </button>
    </header>
    <main id="main-content" class="content-scroll-area" tabindex="-1"><slot /></main>
    <DiagnosticBubble />
    <nav class="bottom-nav" aria-label="Primary navigation">
      <router-link to="/" class="nav-item" exact-active-class="nav-item-active" aria-label="Work"><span class="nav-icon" aria-hidden="true">⌂</span><span>Work</span></router-link>
      <router-link to="/timeline" class="nav-item" exact-active-class="nav-item-active" aria-label="Timeline"><span class="nav-icon" aria-hidden="true">▤</span><span>Timeline</span></router-link>
      <router-link to="/performance" class="nav-item" exact-active-class="nav-item-active" aria-label="Performance"><span class="nav-icon" aria-hidden="true">↗</span><span>Performance</span></router-link>
      <router-link to="/admin" class="nav-item" exact-active-class="nav-item-active" aria-label="Admin"><span class="nav-icon" aria-hidden="true">☷</span><span>Admin</span></router-link>
    </nav>
  </div>
</template>
