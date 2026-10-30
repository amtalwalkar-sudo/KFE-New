import { serializeBackup, validateBackup } from '../../application/backup/backupService.js'

const CONTENT_API = 'https://content.dropboxapi.com/2/files'
const DEFAULT_PATH = '/Apps/KFE/kfe-latest-backup.json'

const requireToken = token => {
  if (typeof token !== 'string' || !token.trim()) throw new Error('Dropbox access token is required.')
  return token.trim()
}

export const createDropboxBackupProvider = ({ accessToken, path = DEFAULT_PATH } = {}) => {
  const token = requireToken(accessToken)
  const targetPath = path.startsWith('/') ? path : `/${path}`
  return Object.freeze({
    name: 'Dropbox',
    async upload(backup) {
      const body = serializeBackup(backup)
      const response = await fetch(`${CONTENT_API}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: targetPath, mode: 'overwrite', autorename: false, mute: true }) }, body })
      if (!response.ok) throw new Error(`Dropbox backup upload failed (${response.status}).`)
      return response.json()
    },
    async download() {
      const response = await fetch(`${CONTENT_API}/download`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: targetPath }) } })
      if (!response.ok) throw new Error(`Dropbox backup download failed (${response.status}).`)
      return validateBackup(await response.text())
    },
  })
}

export const DROPBOX_DEFAULT_BACKUP_PATH = DEFAULT_PATH
