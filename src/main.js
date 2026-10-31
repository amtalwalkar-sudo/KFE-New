import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { installWorkRuntimeAdapter } from './infrastructure/work/workRuntimeAdapter.js'
import App from './App.vue'
import { createKfeRouter } from './router'
import { WorkRuntimePorts } from './application/work/workRuntimePorts.js'
import './styles/kfe-ui.css'
import './styles/forms.css'
import './styles/work-cockpit-hud.css'
import './styles/kfe-base-shell.css'
import './styles/admin-workspace.css'

installWorkRuntimeAdapter()
const router = createKfeRouter({ isNativePlatform: WorkRuntimePorts.platform.getPlatform() !== 'web' })

const app = createApp(App)
app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Runtime Error:', err)
  const componentName = instance?.$options?.name || instance?.$?.type?.name || 'unknown component'
  window.dispatchEvent(new CustomEvent('kfe:runtime-error', {
    detail: {
      message: err?.message || String(err),
      component: componentName,
      phase: info || 'unknown component phase',
      stack: err?.stack || '',
    },
  }))
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
      { startKfeThemeController }
    ] = await Promise.all([
      import('./infrastructure/startup/platformStartup.js'),
      import('./infrastructure/android/androidOverlayLifecycle.js'),
      import('./application/startup/startupService.js'),
      import('./application/startup/permissionGate.js'),
      import('./presentation/theme/kfeThemeController.js')
    ])

    StartupService.configureStartupPlatform(PlatformStartup)
    configureAndroidOverlayLifecycle()

    startKfeThemeController()
    const [
      { BackupConfig },
      { CloudBackupLifecycle },
      { createBackupConfigAdapter },
      { createCloudBackupScheduler },
      { configureBackupFileAdapter },
      { createBackupFileAdapter }
    ] = await Promise.all([
      import('./application/backup/backupConfig.js'),
      import('./application/backup/cloudBackupLifecycle.js'),
      import('./infrastructure/backup/backupConfigAdapter.js'),
      import('./infrastructure/backup/cloudBackupScheduler.js'),
      import('./application/backup/backupFileService.js'),
      import('./infrastructure/backup/backupFileAdapter.js')
    ])
    BackupConfig.configureBackupConfig(createBackupConfigAdapter())
    CloudBackupLifecycle.configureCloudBackupScheduler(createCloudBackupScheduler())
    configureBackupFileAdapter(createBackupFileAdapter())
    const retryDropboxBackup = () => {
      if (document.visibilityState === 'hidden' || navigator.onLine === false) return
      void CloudBackupLifecycle.maybeDailyCloudBackup().then(result => {
        if (result?.status === 'failed') console.warn('Dropbox backup needs attention:', result.error)
      })
    }
    window.addEventListener('online', retryDropboxBackup)
    window.addEventListener('pageshow', retryDropboxBackup)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') retryDropboxBackup()
    })

    // The form module installs its shared keyboard/viewport behavior on import.
    await import('./presentation/forms/universalFormSystem.js')

    window.__KFE_STARTUP_READY__ = false
    await runStartupPermissionGate()
    void StartupService.startApplication().then(() => {
      window.__KFE_STARTUP_READY__ = true
      retryDropboxBackup()
    }).catch(error => {
      window.__KFE_STARTUP_ERROR__ = error?.message || String(error)
      console.error('KFE application startup failed:', error)
    })
  } catch (error) {
    console.error('KFE post-mount infrastructure bootstrap failed:', error)
  }
})()
