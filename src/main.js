import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { installWorkRuntimeAdapter } from './infrastructure/work/workRuntimeAdapter.js'
import App from './App.vue'
import router from './router'
import './styles/kfe-ui.css'
import './styles/forms.css'
import './styles/work-cockpit-hud.css'
import './styles/kfe-base-shell.css'
import './styles/admin-workspace.css'

installWorkRuntimeAdapter()

const app = createApp(App)
app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Runtime Error:', err)
  const root = document.getElementById('app')
  if (!root) return
  root.replaceChildren()
  const box = document.createElement('div')
  box.style.cssText = 'padding:20px;font-family:sans-serif'
  const heading = document.createElement('h2')
  heading.textContent = 'KFE could not render this screen'
  const details = document.createElement('pre')
  const componentName = instance?.$options?.name || instance?.$?.type?.name || 'unknown component'
  details.textContent = [
    `Error: ${err?.message || String(err)}`,
    `Component: ${componentName}`,
    `Vue error phase: ${info || 'unknown'}`,
    err?.stack ? `Stack:\n${err.stack}` : ''
  ].filter(Boolean).join('\n\n')
  details.style.cssText = 'background:#fee2e2;padding:12px;border-radius:6px;overflow:auto;white-space:pre-wrap;max-height:65vh'
  box.append(heading, details)
  root.append(box)
}

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.mount('#app')

// Mounting is the WebView/application-shell boundary. StartupService owns the
// application startup lifecycle after this point.
window.__KFE_APP_MOUNTED__ = true
window.dispatchEvent(new CustomEvent('kfe:app-mounted'))

void (async () => {
  try {
    const [
      { PlatformStartup },
      { configureAndroidOverlayLifecycle },
      { StartupService },
      { runStartupPermissionGate },
      { startKfeThemeController },
      { default: formSystem }
    ] = await Promise.all([
      import('./infrastructure/startup/platformStartup.js'),
      import('./infrastructure/android/androidOverlayLifecycle.js'),
      import('./application/startup/startupService.js'),
      import('./application/startup/permissionGate.js'),
      import('./presentation/theme/kfeThemeController.js'),
      import('./presentation/forms/universalFormSystem.js').then(module => ({ default: module }))
    ])

    StartupService.configureStartupPlatform(PlatformStartup)
    configureAndroidOverlayLifecycle()

    startKfeThemeController()
    try {
      globalThis.localStorage?.removeItem('kfe.backup.configuration.v1')
      globalThis.localStorage?.removeItem('kfe.backup.configuration.v2')
      const { SecureSecretStore } = await import('./infrastructure/security/secureSecretStore.js')
      await SecureSecretStore.remove('kfe.dropbox.access-token')
    } catch (error) {
      console.warn('Could not clear retired cloud-backup settings; startup will continue.', error)
    }

    if (typeof formSystem === 'object') void formSystem

    window.__KFE_STARTUP_READY__ = false
    await runStartupPermissionGate()
    void StartupService.startApplication().then(() => {
      window.__KFE_STARTUP_READY__ = true
    }).catch(error => {
      window.__KFE_STARTUP_ERROR__ = error?.message || String(error)
      console.error('KFE application startup failed:', error)
    })
  } catch (error) {
    console.error('KFE post-mount infrastructure bootstrap failed:', error)
  }
})()
