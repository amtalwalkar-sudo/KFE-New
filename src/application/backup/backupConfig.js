import { createDropboxBackupProvider, DROPBOX_DEFAULT_BACKUP_PATH } from '../../infrastructure/backup/dropboxBackupProvider.js'

const CONFIG_KEY = 'kfe.backup.configuration.v1'
const DEFAULT_CONFIG = Object.freeze({ enabled: false, path: DROPBOX_DEFAULT_BACKUP_PATH, accessToken: '', lastCloudBackupAt: null })
const memoryStorage = new Map()
const storage = () => globalThis.localStorage || { getItem: key => memoryStorage.get(key) || null, setItem: (key, value) => memoryStorage.set(key, value), removeItem: key => memoryStorage.delete(key) }
const readRaw = () => { try { return JSON.parse(storage().getItem(CONFIG_KEY) || 'null') } catch (_) { return null } }
export const getBackupConfiguration = () => { const raw = readRaw(); return { ...DEFAULT_CONFIG, ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) } }
export const saveBackupConfiguration = input => { const current = getBackupConfiguration(); const next = { ...current, ...(input && typeof input === 'object' ? input : {}), enabled: Boolean(input?.enabled), path: typeof input?.path === 'string' && input.path.trim() ? input.path.trim() : current.path, accessToken: typeof input?.accessToken === 'string' ? input.accessToken.trim() : current.accessToken }; storage().setItem(CONFIG_KEY, JSON.stringify(next)); return { ...next } }
export const clearBackupConfiguration = () => { storage().removeItem(CONFIG_KEY); return { ...DEFAULT_CONFIG } }
export const registerConfiguredDropboxProvider = () => { const config = getBackupConfiguration(); if (!config.enabled || !config.accessToken) return null; return createDropboxBackupProvider({ accessToken: config.accessToken, path: config.path }) }
export const markCloudBackupCompleted = timestamp => saveBackupConfiguration({ lastCloudBackupAt: timestamp })
export const BackupConfig = Object.freeze({ getBackupConfiguration, saveBackupConfiguration, clearBackupConfiguration, registerConfiguredDropboxProvider, markCloudBackupCompleted })
