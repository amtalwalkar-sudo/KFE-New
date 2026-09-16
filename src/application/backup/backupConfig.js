import { createDropboxBackupProvider, DROPBOX_DEFAULT_BACKUP_PATH } from '../../infrastructure/backup/dropboxBackupProvider.js'
import { SecureSecretStore } from '../../infrastructure/security/secureSecretStore.js'

const CONFIG_KEY = 'kfe.backup.configuration.v2'
const LEGACY_CONFIG_KEY = 'kfe.backup.configuration.v1'
const TOKEN_KEY = 'kfe.dropbox.access-token'
const DEFAULT_CONFIG = Object.freeze({ enabled: false, path: DROPBOX_DEFAULT_BACKUP_PATH, accessToken: '', hasAccessToken: false, lastCloudBackupAt: null })
const memoryStorage = new Map()
const storage = () => globalThis.localStorage || { getItem: key => memoryStorage.get(key) || null, setItem: (key, value) => memoryStorage.set(key, value), removeItem: key => memoryStorage.delete(key) }
const readRaw = key => { try { return JSON.parse(storage().getItem(key) || 'null') } catch (_) { return null } }

const readConfig = () => { const raw = readRaw(CONFIG_KEY); return { ...DEFAULT_CONFIG, ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) } }
const writeConfig = config => storage().setItem(CONFIG_KEY, JSON.stringify({ enabled: Boolean(config.enabled), path: config.path, lastCloudBackupAt: config.lastCloudBackupAt || null }))

export const getBackupConfiguration = async () => {
  const current = readConfig()
  const legacy = readRaw(LEGACY_CONFIG_KEY)
  let token = await SecureSecretStore.get(TOKEN_KEY)
  if (!token && legacy?.accessToken) {
    token = String(legacy.accessToken).trim()
    await SecureSecretStore.set(TOKEN_KEY, token)
    storage().removeItem(LEGACY_CONFIG_KEY)
  }
  return { ...current, accessToken: '', hasAccessToken: Boolean(token) }
}

export const saveBackupConfiguration = async input => {
  const current = readConfig()
  const next = { ...current, ...(input && typeof input === 'object' ? input : {}) }
  next.enabled = Boolean(next.enabled)
  next.path = typeof next.path === 'string' && next.path.trim() ? next.path.trim() : current.path
  if (typeof input?.accessToken === 'string' && input.accessToken.trim()) await SecureSecretStore.set(TOKEN_KEY, input.accessToken.trim())
  writeConfig(next)
  const saved = await getBackupConfiguration()
  return saved
}

export const clearBackupConfiguration = async () => {
  storage().removeItem(CONFIG_KEY)
  storage().removeItem(LEGACY_CONFIG_KEY)
  await SecureSecretStore.remove(TOKEN_KEY)
  return { ...DEFAULT_CONFIG }
}

export const registerConfiguredDropboxProvider = async () => {
  const config = readConfig()
  const accessToken = await SecureSecretStore.get(TOKEN_KEY)
  if (!config.enabled || !accessToken) return null
  return createDropboxBackupProvider({ accessToken, path: config.path })
}

export const markCloudBackupCompleted = async timestamp => saveBackupConfiguration({ lastCloudBackupAt: timestamp })
export const BackupConfig = Object.freeze({ getBackupConfiguration, saveBackupConfiguration, clearBackupConfiguration, registerConfiguredDropboxProvider, markCloudBackupCompleted })
