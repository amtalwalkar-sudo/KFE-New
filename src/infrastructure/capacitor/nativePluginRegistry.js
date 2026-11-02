import { Capacitor, registerPlugin } from '@capacitor/core'

// The sole registration point for native Capacitor plugins.
// Feature adapters depend on these stable plugin instances, never register plugins themselves.
export { Capacitor }

export const NativePlugins = Object.freeze({
  workActions: registerPlugin('KfeNativeWorkActions'),
  canonicalWork: registerPlugin('KfeCanonicalWork'),
  overlay: registerPlugin('KfeOverlay'),
  tripBoundaryLocation: registerPlugin('KfeTripBoundaryLocation'),
  secureStorage: registerPlugin('KfeSecureStorage'),
  backupFile: registerPlugin('KfeBackupFile'),
  system: registerPlugin('KfeNativeSystem'),
})
