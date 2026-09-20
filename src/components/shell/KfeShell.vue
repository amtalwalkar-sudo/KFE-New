<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import DiagnosticBubble from '../DiagnosticBubble.vue'

const gpsState = ref('checking')
let gpsRefreshTimer = null

function connectGps() {
  if (!('geolocation' in navigator)) {
    gpsState.value = 'unsupported'
    return
  }

  gpsState.value = 'checking'

  navigator.geolocation.getCurrentPosition(
    () => { gpsState.value = 'connected' },
    (error) => {
      gpsState.value = error.code === 1 ? 'permission' : 'unavailable'
    },
    { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
  )
}

function gpsStateLabel() {
  if (gpsState.value === 'connected') return 'GPS connected'
  if (gpsState.value === 'permission') return 'GPS permission needed'
  if (gpsState.value === 'unsupported') return 'GPS unavailable'
  if (gpsState.value === 'unavailable') return 'GPS unavailable'
  return 'Connecting GPS'
}

onMounted(() => {
  connectGps()
  gpsRefreshTimer = window.setInterval(connectGps, 60000)
})
onBeforeUnmount(() => {
  if (gpsRefreshTimer !== null) window.clearInterval(gpsRefreshTimer)
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
        :class="`is-${gpsState}`"
        type="button"
        :title="gpsStateLabel()"
        :aria-label="gpsStateLabel()"
        @click="connectGps"
      >
        <svg class="gps-icon" viewBox="0 0 24 24" aria-hidden="true">
          <template v-if="gpsState === 'checking'">
            <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.8" />
            <circle cx="12" cy="12" r="2.2" fill="currentColor" />
          </template>
          <template v-else-if="gpsState === 'connected'">
            <path d="M12 3.2c-3.6 0-6.5 2.9-6.5 6.5 0 4.7 6.5 11.1 6.5 11.1s6.5-6.4 6.5-11.1c0-3.6-2.9-6.5-6.5-6.5Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
            <circle cx="12" cy="9.7" r="2.2" fill="currentColor"/>
          </template>
          <template v-else>
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="M12 8v5M12 16.5v.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </template>
        </svg>
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
