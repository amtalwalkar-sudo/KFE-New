export const downloadBackupText = (serializedBackup, filename) => {
  const blob = new Blob([serializedBackup], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Some mobile browsers/WebViews begin processing the download after click().
  // Revoking the blob URL synchronously can cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const readBackupFileText = file => file.text()
