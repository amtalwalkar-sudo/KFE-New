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

// Mounting is the WebView/application-shell boundary. StartupService owns the
// application startup lifecycle after this point.
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
      { runStartupPermissionGate },
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
      import('./application/startup/permissionGate.js'),
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

    let retryCloudBackupOnStartup = null
    if (!window.__KFE_STARTUP_LIFECYCLE_BOUND__) {
      window.__KFE_STARTUP_LIFECYCLE_BOUND__ = true
      // Dropbox backup requires the application data/credential context. The
      // service worker cannot perform that upload by itself, so retry on app
      // foreground, restored connectivity, and periodic foreground intervals.
      const retryCloudBackup = () => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
        void CloudBackupLifecycle.maybeDailyCloudBackup().then(result => {
          if (result?.status === 'failed') console.warn('KFE automatic Dropbox backup needs attention:', result.error)
        }).catch(error => console.warn('KFE automatic Dropbox backup retry failed:', error))
      }
      retryCloudBackupOnStartup = retryCloudBackup
      window.addEventListener('online', retryCloudBackup)
      window.addEventListener('pageshow', retryCloudBackup)
      document.addEventListener('visibilitychange', retryCloudBackup)
      // A foreground-only retry is intentional. It avoids promising an Android
      // background upload that cannot read the WebView's canonical IndexedDB.
      window.setInterval(retryCloudBackup, 6 * 60 * 60 * 1000)
      if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', event => {
          if (event.data?.type === 'kfe:daily-cloud-backup') retryCloudBackup()
        })
      }
      // Startup invokes the first attempt after canonical storage initialization.
    }

    window.__KFE_STARTUP_READY__ = false
    await runStartupPermissionGate()
    void StartupService.startApplication().then(() => {
      window.__KFE_STARTUP_READY__ = true
      retryCloudBackupOnStartup?.()
    }).catch(error => {
      window.__KFE_STARTUP_ERROR__ = error?.message || String(error)
      console.error('KFE application startup failed:', error)
    })
  } catch (error) {
    console.error('KFE post-mount infrastructure bootstrap failed:', error)
  }
})()
