import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeBackupFile = registerPlugin('KfeBackupFile')

export const isNativeBackupFilePlatform = () => Capacitor.isNativePlatform()

export const downloadBackupText = async (serializedBackup, filename) => {
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
}

export const chooseBackupFileText = async () => {
  if (!Capacitor.isNativePlatform()) return null
  const selected = await NativeBackupFile.open()
  if (selected?.opened !== true || typeof selected.content !== 'string') {
    throw new Error('Android did not confirm that the backup file was read.')
  }
  return { name: selected.filename || 'KFE-backup.json', text: selected.content }
}

export const readBackupFileText = file => file.text()
