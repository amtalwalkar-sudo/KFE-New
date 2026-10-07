import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/kfe-ui.css'
import './styles/forms.css'
import './styles/work-cockpit-hud.css'
import './styles/kfe-base-shell.css'

const app = createApp(App)
app.config.errorHandler = (err) => {
  console.error('Vue Runtime Error:', err)
  const root = document.getElementById('app')
  if (!root) return
  root.replaceChildren()
  const box = document.createElement('div')
  box.style.cssText = 'padding:20px;font-family:sans-serif'
  const heading = document.createElement('h2')
  heading.textContent = 'KFE could not render this screen'
  const details = document.createElement('pre')
  details.textContent = err?.message || String(err)
  details.style.cssText = 'background:#fee2e2;padding:12px;border-radius:6px;overflow:auto;white-space:pre-wrap'
  box.append(heading, details)
  root.append(box)
}

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.mount('#app')

// This is the hard startup boundary: once Vue is mounted, the application is usable.
// Storage, recovery, backup, theme, overlay, and service-worker work must never prevent
// the WebView from reaching the mounted UI.
window.__KFE_APP_MOUNTED__ = true
window.dispatchEvent(new CustomEvent('kfe:app-mounted'))

void (async () => {
  try {
    const [
      { BackupConfig },
      { CloudBackupLifecycle },
      { configureLocationProvider },
      { createBackupConfigAdapter },
      { createCloudBackupScheduler },
      { captureCurrentLocation },
      { PlatformStartup },
      { configureAndroidOverlayLifecycle },
      { StartupService },
      { startApplication },
      { startKfeThemeController },
      { Capacitor },
      { default: formSystem }
    ] = await Promise.all([
      import('./application/backup/backupConfig.js'),
      import('./application/backup/cloudBackupLifecycle.js'),
      import('./application/work/locationProvider.js'),
      import('./infrastructure/backup/backupConfigAdapter.js'),
      import('./infrastructure/backup/cloudBackupScheduler.js'),
      import('./infrastructure/location/currentLocation.js'),
      import('./infrastructure/startup/platformStartup.js'),
      import('./infrastructure/android/androidOverlayLifecycle.js'),
      import('./application/startup/startupService.js'),
      import('./application/startup/startupRuntime.js'),
      import('./presentation/theme/kfeThemeController.js'),
      import('@capacitor/core'),
      import('./presentation/forms/universalFormSystem.js').then(module => ({ default: module }))
    ])

    BackupConfig.configureBackupConfig(createBackupConfigAdapter())
    CloudBackupLifecycle.configureCloudBackupScheduler(createCloudBackupScheduler())
    configureLocationProvider(captureCurrentLocation)
    StartupService.configureStartupPlatform(PlatformStartup)
    configureAndroidOverlayLifecycle()

    startKfeThemeController()

    if (typeof formSystem === 'object') void formSystem

    if (!window.__KFE_STARTUP_LIFECYCLE_BOUND__) {
      window.__KFE_STARTUP_LIFECYCLE_BOUND__ = true
      if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
          if (event.data?.type === 'kfe:daily-cloud-backup') {
            void CloudBackupLifecycle.maybeDailyCloudBackup().catch(error => console.warn('KFE scheduled cloud backup failed:', error))
          }
        })
      }
    }

    void startApplication().catch(error => console.error('KFE application startup failed:', error))
  } catch (error) {
    console.error('KFE post-mount infrastructure bootstrap failed:', error)
  }
})()
