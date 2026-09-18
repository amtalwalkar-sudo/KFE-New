<script setup>
import { ref } from 'vue'
import DiagnosticBubble from './components/DiagnosticBubble.vue'

const props = defineProps({ startupError: { type: String, default: null } })
const renderError = ref(null)
const recoverApp = () => { renderError.value = null; window.location.reload() }
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

    <main id="main-content" class="content-scroll-area" tabindex="-1">
      <div v-if="renderError" class="error-container" role="alert">
        <h3>Something went wrong</h3><p>{{ renderError }}</p><button @click="recoverApp" class="retry-btn">Reload Application</button>
      </div>
      <div v-else-if="props.startupError" class="error-container" role="alert">
        <h3>Application initialization failed</h3><p>{{ props.startupError }}</p><button @click="recoverApp" class="retry-btn">Retry Initialization</button>
      </div>
      <router-view v-else v-slot="{ Component }"><keep-alive><component :is="Component" /></keep-alive></router-view>
    </main>

    <DiagnosticBubble />

    <nav class="bottom-nav" aria-label="Primary navigation">
      <router-link to="/" class="nav-item" exact-active-class="nav-item-active" aria-label="Work">
        <span class="nav-icon" aria-hidden="true">⌂</span><span>Work</span>
      </router-link>
      <router-link to="/timeline" class="nav-item" exact-active-class="nav-item-active" aria-label="Timeline">
        <span class="nav-icon" aria-hidden="true">▤</span><span>Timeline</span>
      </router-link>
      <router-link to="/performance" class="nav-item" exact-active-class="nav-item-active" aria-label="Performance">
        <span class="nav-icon" aria-hidden="true">↗</span><span>Performance</span>
      </router-link>
      <router-link to="/admin" class="nav-item" exact-active-class="nav-item-active" aria-label="Admin">
        <span class="nav-icon" aria-hidden="true">☷</span><span>Admin</span>
      </router-link>
    </nav>
  </div>
</template>

<style scoped>
.viewport-wrapper{position:fixed;inset:0;display:flex;flex-direction:column;width:100vw;height:100dvh;background:var(--kfe-ui-bg);overflow:hidden;color:var(--kfe-ui-text)}
.top-bar{position:fixed;top:0;left:0;right:0;min-height:64px;height:64px;padding:8px max(16px,env(safe-area-inset-right)) 8px max(16px,env(safe-area-inset-left));display:flex;align-items:center;justify-content:space-between;gap:12px;background:color-mix(in srgb,var(--kfe-ui-surface) 96%,transparent);border-bottom:1px solid var(--kfe-ui-border);box-shadow:var(--kfe-ui-shadow);backdrop-filter:blur(14px);z-index:9999}
.brand-lockup{display:flex;align-items:center;gap:10px;min-width:0}.brand-mark{width:38px;height:38px;display:grid;place-items:center;flex:0 0 38px;border-radius:var(--kfe-radius-md,12px);background:var(--kfe-ui-accent);color:#fff;font-size:1.05rem;font-weight:950}.brand-copy{display:grid;min-width:0;line-height:1.15}.brand-copy strong{font-size:.9rem;font-weight:900;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.brand-copy span{margin-top:3px;font-size:.62rem;font-weight:700;color:var(--kfe-muted-text);letter-spacing:.03em}.header-status{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid var(--kfe-ui-border);border-radius:999px;background:var(--kfe-ui-surface-2);font-size:.61rem;font-weight:800;color:var(--kfe-muted-text);white-space:nowrap}.status-dot{width:7px;height:7px;border-radius:50%;background:var(--kfe-success)}
.content-scroll-area{position:absolute;top:64px;bottom:76px;left:0;right:0;overflow-y:auto;-webkit-overflow-scrolling:touch;scroll-padding-top:14px;padding:0 max(0px,env(safe-area-inset-left)) max(20px,env(safe-area-inset-bottom))}
.bottom-nav{position:fixed;bottom:0;left:0;right:0;min-height:76px;padding:7px 10px max(7px,env(safe-area-inset-bottom));display:flex;justify-content:center;gap:6px;background:color-mix(in srgb,var(--kfe-ui-surface) 98%,transparent);border-top:1px solid var(--kfe-ui-border);box-shadow:0 -5px 20px color-mix(in srgb,var(--kfe-ui-text) 6%,transparent);backdrop-filter:blur(14px);z-index:9999}.nav-item{display:flex;flex:1;max-width:150px;min-height:58px;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:var(--kfe-radius-md,14px);text-decoration:none;color:var(--kfe-muted-text);font-size:.65rem;font-weight:750;transition:background .15s ease,color .15s ease,transform .08s ease}.nav-item:hover{background:var(--kfe-ui-surface-2)}.nav-item:active{transform:translateY(1px)}.nav-item-active{background:color-mix(in srgb,var(--kfe-ui-accent) 11%,var(--kfe-ui-surface));color:var(--kfe-ui-accent);font-weight:900}.nav-icon{font-size:1.15rem;line-height:1;font-weight:800}.nav-item-active .nav-icon{transform:translateY(-1px)}
.error-container{max-width:560px;margin:48px auto;padding:28px 20px;text-align:center;color:var(--kfe-danger)}.error-container h3{margin:0 0 8px;font-size:1.1rem}.error-container p{color:var(--kfe-muted-text);font-size:.8rem;line-height:1.5}.retry-btn{min-height:46px;padding:10px 16px;background:var(--kfe-ui-accent);color:#fff;border:0;border-radius:var(--kfe-radius-md,12px);font-weight:850;cursor:pointer}.kfe-skip-link{position:fixed;top:8px;left:8px;z-index:20000;padding:10px 14px;border-radius:10px;background:var(--kfe-ui-text);color:var(--kfe-ui-bg);text-decoration:none;font-weight:800;transform:translateY(-150%);transition:transform .15s ease}.kfe-skip-link:focus{transform:translateY(0)}
@media(max-width:600px){.top-bar{min-height:62px;height:62px}.content-scroll-area{top:62px;bottom:76px}.header-status{padding:6px 8px}.brand-mark{width:36px;height:36px;flex-basis:36px}.brand-copy strong{font-size:.84rem}.brand-copy span{font-size:.58rem}.bottom-nav{min-height:76px}}

/* KFE Visual DNA — final shell correction: unmistakable product shell */
.viewport-wrapper{background:var(--kfe-ui-bg)!important}
.top-bar{min-height:72px;height:72px;padding:10px 18px!important;background:var(--kfe-ui-surface)!important;border-bottom:1px solid var(--kfe-ui-border)!important;box-shadow:0 2px 12px color-mix(in srgb,var(--kfe-ui-text) 5%,transparent)!important;backdrop-filter:none!important}
.brand-lockup{gap:12px}.brand-mark{width:42px;height:42px;flex-basis:42px;border-radius:12px;font-size:1.1rem}
.brand-copy strong{font-size:.95rem}.brand-copy span{font-size:.65rem}
.header-status{border-radius:10px;background:var(--kfe-ui-surface-2)!important;padding:8px 10px}
.content-scroll-area{top:72px!important}
.bottom-nav{min-height:82px!important;background:var(--kfe-ui-surface)!important;border-top:1px solid var(--kfe-ui-border)!important;box-shadow:0 -4px 16px color-mix(in srgb,var(--kfe-ui-text) 5%,transparent)!important;backdrop-filter:none!important}
.nav-item{min-height:62px;border-radius:12px}.nav-item-active{background:var(--kfe-ui-accent)!important;color:#fff!important}.nav-item-active .nav-icon{color:#fff!important}
.nav-icon{font-size:1.2rem}
@media(max-width:600px){.top-bar{min-height:68px;height:68px;padding:9px 12px!important}.content-scroll-area{top:68px!important}.bottom-nav{min-height:78px!important}.brand-copy strong{font-size:.86rem}}

</style>