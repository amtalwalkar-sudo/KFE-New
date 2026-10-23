import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeBackupFile = registerPlugin('KfeBackupFile')

export const downloadBackupText = async (serializedBackup, filename) => {
  if (Capacitor.isNativePlatform()) {
    // Android WebView does not reliably route <a download> Blob URLs to Downloads.
    // Use Android's document picker so the user chooses a real destination.
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
    // Mobile browsers can start processing the download after click().
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return { method: 'browser-download' }
}

export const readBackupFileText = file => file.text()
