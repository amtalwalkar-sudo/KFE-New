// Dropbox backup currently runs in the application/WebView context because
// canonical records live in WebView IndexedDB and the credential provider is
// configured there. A service-worker wake-up can notify a live page, but it
// cannot guarantee an upload while the app is closed or Android has killed it.
export const CLOUD_BACKUP_EXECUTION_MODE = 'FOREGROUND_WHEN_APP_OPEN'

export const createCloudBackupScheduler = () => Object.freeze({
  async registerDaily() {
    // Deliberately do not register Periodic Background Sync as a "backup
    // scheduler": that event only notifies clients and is not a cloud upload.
    // main.js retries on startup, app resume, restored connectivity, visible
    // page and a six-hour foreground interval instead.
    return false
  },
})
