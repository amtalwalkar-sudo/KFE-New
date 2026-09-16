<script setup>
import { ref, onErrorCaptured, onMounted } from 'vue'
import { ShellService } from './application/shell/shellService.js'
import { BackupService } from './application/backup/backupService.js'
import { CloudBackupLifecycle } from './application/backup/cloudBackupLifecycle.js'
import DiagnosticBubble from './components/DiagnosticBubble.vue'

const renderError = ref(null)
const storageReady = ref(false)
const storageError = ref(null)

onErrorCaptured((err) => { console.error('Captured Runtime Boundary Error:', err); renderError.value = err.message || 'An unexpected rendering error occurred.'; return false })
const recoverApp = () => { renderError.value = null; storageError.value = null; storageReady.value = false; window.location.reload() }
onMounted(async () => {
  try {
    await ShellService.initialize()
    storageReady.value = true
    try { await BackupService.maybeDailyLocalBackup() } catch (error) { console.warn('KFE daily local backup checkpoint failed:', error) }
    void CloudBackupLifecycle.registerDailyCloudBackupSchedule()
    void CloudBackupLifecycle.maybeDailyCloudBackup().catch(error => console.warn('KFE cloud backup lifecycle failed:', error))
  } catch (e) { console.error('Application shell initialization failed:', e); storageError.value = e?.message || 'Application initialization failed.' }
})
</script>

<template>
  <div class="viewport-wrapper">
    <a class="kfe-skip-link" href="#main-content">Skip to main content</a>
    <header class="top-bar" aria-label="KFE application header"><span class="app-title">Kanishka Enterprises</span><span class="app-context">KFE</span></header>
    <main id="main-content" class="content-scroll-area" tabindex="-1">
      <div v-if="renderError" class="error-container" role="alert"><h3>Something went wrong</h3><p>{{ renderError }}</p><button @click="recoverApp" class="retry-btn">Reload Application</button></div>
      <div v-else-if="storageError" class="error-container" role="alert"><h3>Application initialization failed</h3><p>{{ storageError }}</p><button @click="recoverApp" class="retry-btn">Retry Initialization</button></div>
      <div v-else-if="!storageReady" class="loading-container" role="status" aria-live="polite"><p>Initializing KFE…</p></div>
      <router-view v-else v-slot="{ Component }"><keep-alive><component :is="Component" /></keep-alive></router-view>
    </main>
    <DiagnosticBubble />
    <nav class="bottom-nav" aria-label="Primary navigation">
      <router-link to="/" class="nav-item" exact-active-class="nav-item-active" aria-label="Work"><span class="icon" aria-hidden="true">WORK</span><span>Work</span></router-link>
      <router-link to="/performance" class="nav-item" exact-active-class="nav-item-active" aria-label="Performance"><span class="icon" aria-hidden="true">KPI</span><span>Performance</span></router-link>
      <router-link to="/admin" class="nav-item" exact-active-class="nav-item-active" aria-label="Admin"><span class="icon" aria-hidden="true">ADMIN</span><span>Admin</span></router-link>
    </nav>
  </div>
</template>

<style scoped>
.viewport-wrapper{position:fixed;inset:0;display:flex;flex-direction:column;height:100vh;height:100dvh;width:100vw;background:var(--kfe-bg);overflow:hidden}.top-bar{position:fixed;top:0;left:0;right:0;min-height:52px;height:52px;background:var(--kfe-text);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 max(16px,env(safe-area-inset-right)) 0 max(16px,env(safe-area-inset-left));padding-top:env(safe-area-inset-top);z-index:9999}.app-title{font-weight:800;font-size:.9rem}.app-context{font-size:.7rem;font-weight:800;letter-spacing:.08em;opacity:.75}.content-scroll-area{position:absolute;top:52px;bottom:64px;left:0;right:0;overflow-y:auto;-webkit-overflow-scrolling:touch;scroll-padding-top:12px;padding-bottom:env(safe-area-inset-bottom)}.bottom-nav{position:fixed;bottom:0;left:0;right:0;height:64px;padding-bottom:env(safe-area-inset-bottom);background:var(--kfe-surface);border-top:1px solid var(--kfe-border);display:flex;justify-content:space-around;align-items:center;z-index:9999}.nav-item{display:flex;flex:1;max-width:140px;min-height:44px;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-decoration:none;color:var(--kfe-text-muted);font-size:.75rem}.nav-item-active{color:var(--kfe-primary);font-weight:800}.icon{font-size:.58rem;font-weight:900;letter-spacing:.04em}.error-container,.loading-container{max-width:560px;margin:auto;padding:28px 20px;text-align:center}.error-container{color:var(--kfe-danger)}.retry-btn{min-height:44px;padding:10px 16px;background:var(--kfe-primary);color:#fff;border:0;border-radius:var(--kfe-radius-sm);font-weight:800;cursor:pointer}@media(max-width:600px){.content-scroll-area{bottom:68px}.bottom-nav{height:68px}}
</style>
