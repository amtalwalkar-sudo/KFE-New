/**
 * Select the safe lifecycle persistence path for the current runtime.
 * Android must not create browser-only Shift/Trip records when SQLite cannot
 * be reached: recovery could otherwise mistake them for interrupted first writes.
 */
export const assertLifecycleStorageAvailable = ({ platform, nativeAvailable }) => {
  if (nativeAvailable === true) return true
  if (platform === 'web') return false
  if (platform === 'android') {
    throw new Error('Android canonical SQLite storage is unavailable; canonical Shift/Trip writes are blocked to protect canonical data.')
  }
  throw new Error('Cannot verify canonical write storage for this runtime; canonical Shift/Trip writes are blocked.')
}
