import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { BackupConfig } from './application/backup/backupConfig.js'
import { CloudBackupLifecycle } from './application/backup/cloudBackupLifecycle.js'
import { configureLocationProvider } from './application/work/locationProvider.js'
import { createBackupConfigAdapter } from './infrastructure/backup/backupConfigAdapter.js'
import { createCloudBackupScheduler } from './infrastructure/backup/cloudBackupScheduler.js'
import { captureCurrentLocation } from './infrastructure/location/currentLocation.js'
import { PlatformStartup } from './infrastructure/startup/platformStartup.js'
import { configureAndroidOverlayLifecycle } from './infrastructure/android/androidOverlayLifecycle.js'
import { StartupService } from './application/startup/startupService.js'
import { startApplication } from './application/startup/startupRuntime.js'
import './styles/kfe-ui.css'
import './styles/work-cockpit-hud.css'
import { startKfeThemeController } from './presentation/theme/kfeThemeController.js'

startKfeThemeController()

if ('serviceWorker' in navigator) {
  let reloadedForController = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForController) return
    reloadedForController = true
    window.location.reload()
  })
}

BackupConfig.configureBackupConfig(createBackupConfigAdapter())
CloudBackupLifecycle.configureCloudBackupScheduler(createCloudBackupScheduler())
configureLocationProvider(captureCurrentLocation)
StartupService.configureStartupPlatform(PlatformStartup)
configureAndroidOverlayLifecycle()

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'kfe:daily-cloud-backup') {
      void CloudBackupLifecycle.maybeDailyCloudBackup().catch(error => console.warn('KFE scheduled cloud backup failed:', error))
    }
  })
}

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

// StartupService.initializeApplication() is invoked by startApplication() after the UI mounts.
void startApplication().catch(error => console.error('KFE application startup failed:', error))
