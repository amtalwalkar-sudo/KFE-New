export const downloadBackupText = (serializedBackup, filename) => {
  const blob = new Blob([serializedBackup], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export const readBackupFileText = file => file.text()
