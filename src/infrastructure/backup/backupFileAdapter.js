import { Capacitor, NativePlugins } from '../capacitor/nativePluginRegistry.js'

const NativeBackupFile = NativePlugins.backupFile

export const createBackupFileAdapter = () => Object.freeze({
  isNativePlatform: () => Capacitor.isNativePlatform(),
  async downloadBackupText(serializedBackup, filename) {
    if (Capacitor.isNativePlatform()) {
      await NativeBackupFile.save({ filename, content: serializedBackup })
      return { method: 'native-document-picker' }
    }
    const blob = new Blob([serializedBackup], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    return { method: 'browser-download' }
  },
  async chooseBackupFileText() {
    if (!Capacitor.isNativePlatform()) return null
    const selected = await NativeBackupFile.open()
    if (selected?.opened !== true || typeof selected.content !== 'string') {
      throw new Error('Android did not confirm that the backup file was read.')
    }
    return { name: selected.filename || 'KFE-backup.json', text: selected.content }
  },
  readBackupFileText: file => file.text(),
})
