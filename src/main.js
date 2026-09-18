import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { StartupService } from './application/startup/startupService.js'
import { BackupConfig } from './application/backup/backupConfig.js'
import { CloudBackupLifecycle } from './application/backup/cloudBackupLifecycle.js'
import { configureLocationProvider } from './application/work/locationProvider.js'
import { createBackupConfigAdapter } from './infrastructure/backup/backupConfigAdapter.js'
import { createCloudBackupScheduler } from './infrastructure/backup/cloudBackupScheduler.js'
import { captureCurrentLocation } from './infrastructure/location/currentLocation.js'
import { PlatformStartup } from './infrastructure/startup/platformStartup.js'
import './styles/ui-tokens.css'
import './styles/ui-system.css'
import './styles/kfe-visual-application.css'

BackupConfig.configureBackupConfig(createBackupConfigAdapter())
CloudBackupLifecycle.configureCloudBackupScheduler(createCloudBackupScheduler())
configureLocationProvider(captureCurrentLocation)
StartupService.configureStartupPlatform(PlatformStartup)

let startupError = null
try {
  await StartupService.initializeApplication()
} catch (error) {
  console.error('KFE application startup failed:', error)
  startupError = error?.message || 'Application initialization failed.'
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'kfe:daily-cloud-backup') {
      void CloudBackupLifecycle.maybeDailyCloudBackup().catch(error => console.warn('KFE scheduled cloud backup failed:', error))
    }
  })
}

const app = createApp(App, { startupError })
app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Runtime Error:', err, info)
  document.body.innerHTML = `<div style="padding:20px;color:red;font-family:sans-serif;"><h2>Runtime Error Captured:</h2><pre style="background:#fee2e2;padding:12px;border-radius:6px;overflow:auto;">${err.stack || err}</pre></div>`
}

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.mount('#app')
