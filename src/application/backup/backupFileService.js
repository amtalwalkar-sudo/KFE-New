let adapter = null

const requireAdapter = () => {
  if (!adapter) throw new Error('Backup file adapter has not been configured.')
  return adapter
}

export const configureBackupFileAdapter = nextAdapter => {
  if (!nextAdapter || typeof nextAdapter.isNativePlatform !== 'function' || typeof nextAdapter.downloadBackupText !== 'function' || typeof nextAdapter.chooseBackupFileText !== 'function' || typeof nextAdapter.readBackupFileText !== 'function') {
    throw new TypeError('Invalid backup file adapter.')
  }
  adapter = nextAdapter
}

export const isNativeBackupPlatform = () => requireAdapter().isNativePlatform()
export const downloadBackupText = (...args) => requireAdapter().downloadBackupText(...args)
export const chooseBackupFileText = (...args) => requireAdapter().chooseBackupFileText(...args)
export const readBackupFileText = (...args) => requireAdapter().readBackupFileText(...args)

export const BackupFileService = Object.freeze({ configureBackupFileAdapter, isNativeBackupPlatform, downloadBackupText, chooseBackupFileText, readBackupFileText })
