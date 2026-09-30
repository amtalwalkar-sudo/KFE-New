const DAY_MS = 24 * 60 * 60 * 1000

export const createCloudBackupScheduler = () => Object.freeze({
  async registerDaily() {
    try {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'periodicSync' in ServiceWorkerRegistration.prototype) {
        const registration = await navigator.serviceWorker.ready
        const permission = await navigator.permissions?.query?.({ name: 'periodic-background-sync' }).catch(() => null)
        if (!permission || permission.state !== 'denied') await registration.periodicSync.register('kfe-daily-cloud-backup', { minInterval: DAY_MS })
        return true
      }
    } catch (error) { console.warn('KFE periodic cloud backup registration unavailable:', error) }
    return false
  },
})
