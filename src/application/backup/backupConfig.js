let adapter = null

const requireAdapter = () => {
  if (!adapter) throw new Error('Backup configuration adapter has not been configured.')
  return adapter
}

export const configureBackupConfig = nextAdapter => {
  if (!nextAdapter || typeof nextAdapter.get !== 'function' || typeof nextAdapter.save !== 'function' || typeof nextAdapter.clear !== 'function' || typeof nextAdapter.createConfiguredProvider !== 'function') throw new TypeError('Invalid backup configuration adapter.')
  adapter = nextAdapter
}

export const getBackupConfiguration = async () => requireAdapter().get()
export const saveBackupConfiguration = async input => requireAdapter().save(input)
export const clearBackupConfiguration = async () => requireAdapter().clear()
export const registerConfiguredBackupProvider = async () => requireAdapter().createConfiguredProvider()
export const markCloudBackupCompleted = async timestamp => saveBackupConfiguration({ lastCloudBackupAt: timestamp })

export const BackupConfig = Object.freeze({ getBackupConfiguration, saveBackupConfiguration, clearBackupConfiguration, registerConfiguredBackupProvider, markCloudBackupCompleted, configureBackupConfig })
