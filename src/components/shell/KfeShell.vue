<script setup>
import { useRoute } from 'vue-router'
import GpsStatusIndicator from './GpsStatusIndicator.vue'
const route = useRoute()
</script>

<template>
  <div class="viewport-wrapper kfe-frozen-shell" data-kfe-ui="frozen-v1">
    <a class="kfe-skip-link" href="#main-content">Skip to main content</a>
    <header v-if="route.meta?.shell?.header !== false" class="top-bar" aria-label="KFE application header">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">K</div>
        <div class="brand-copy"><strong>Kanishka Enterprises</strong></div>
      </div>
      <GpsStatusIndicator />
    </header>
    <main id="main-content" class="content-scroll-area" tabindex="-1"><slot /></main>
    <DiagnosticBubble />
    <nav class="bottom-nav" aria-label="Primary navigation">
      <router-link to="/" class="nav-item" exact-active-class="nav-item-active" aria-label="Work">
        <span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></svg></span><span class="nav-icon-label">Work</span>
      </router-link>
      <router-link to="/timeline" class="nav-item" exact-active-class="nav-item-active" aria-label="Timeline">
        <span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span><span>Timeline</span>
      </router-link>
      <router-link to="/performance" class="nav-item" exact-active-class="nav-item-active" aria-label="Performance">
        <span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-7"/></svg></span><span>Performance</span>
      </router-link>
      <router-link to="/admin" class="nav-item" exact-active-class="nav-item-active" aria-label="Admin">
        <span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></svg></span><span>Admin</span>
      </router-link>
    </nav>
  </div>
</template>
