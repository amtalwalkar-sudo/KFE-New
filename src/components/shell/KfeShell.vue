<script setup>
import DiagnosticBubble from '../DiagnosticBubble.vue'
</script>

<template>
  <div class="viewport-wrapper">
    <a class="kfe-skip-link" href="#main-content">Skip to main content</a>
    <header class="top-bar" aria-label="KFE application header">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">K</div>
        <div class="brand-copy">
          <strong>Kanishka Enterprises</strong>
          <span>Fleet ERP · KFE 2.0</span>
        </div>
      </div>
      <div class="header-status"><span class="status-dot" aria-hidden="true"></span><span>Local-first</span></div>
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

