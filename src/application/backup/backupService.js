import { createBackupRepository } from '../../repositories/backupRepository.js'
export const BACKUP_FORMAT = 'KFE_BACKUP'
export const BACKUP_FORMAT_VERSION = 3
export const CANONICAL_BACKUP_STORES = Object.freeze(['financial_period_snapshots','shifts','fuel_logs','odoGaps','pending_mutations','days','trips','gps_snapshots','movement_artifacts','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','audit_history'])
const PRE_FA4_BACKUP_STORES = Object.freeze(['shifts','fuel_logs','odoGaps','pending_mutations','days','trips','gps_snapshots','movement_artifacts','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','audit_history'])
const LEGACY_BACKUP_STORES_V1 = Object.freeze([...PRE_FA4_BACKUP_STORES.filter(name => name !== 'audit_history').slice(0, 11), 'driver_collected_data', ...PRE_FA4_BACKUP_STORES.filter(name => name !== 'audit_history').slice(11)])
const LEGACY_BACKUP_STORES_V2 = Object.freeze([...PRE_FA4_BACKUP_STORES.slice(0, 11), 'driver_collected_data', ...PRE_FA4_BACKUP_STORES.slice(11)])
const backupRepository = createBackupRepository(CANONICAL_BACKUP_STORES)
export const validateBackup = input => {
  let backup = input
  if (typeof input === 'string') { try { backup = JSON.parse(input) } catch (_) { throw new Error('Backup file is not valid JSON.') } }
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('Backup must be a JSON object.')
  if (backup.format !== BACKUP_FORMAT) throw new Error('Unsupported KFE backup format.')
  if (![1, 2, BACKUP_FORMAT_VERSION].includes(backup.formatVersion)) throw new Error(`Unsupported backup format version: ${backup.formatVersion}.`)
  const sourceVersion = backup.source?.dbVersion
  const supportedSourceVersions = backup.formatVersion === BACKUP_FORMAT_VERSION ? [11, 12] : [8, 9]
  if (!backup.source || backup.source.dbName !== 'kanishka_kfe_canonical_db' || !supportedSourceVersions.includes(sourceVersion)) throw new Error('Backup source does not match a supported canonical KFE database version.')
  if (typeof backup.exportedAt !== 'string' || Number.isNaN(Date.parse(backup.exportedAt))) throw new Error('Backup exportedAt timestamp is invalid.')
  if (!backup.stores || typeof backup.stores !== 'object' || Array.isArray(backup.stores)) throw new Error('Backup stores section is missing.')
  const expectedStores = backup.formatVersion === BACKUP_FORMAT_VERSION && sourceVersion === 11
    ? CANONICAL_BACKUP_STORES.filter(name => name !== 'financial_period_snapshots')
    : backup.formatVersion === BACKUP_FORMAT_VERSION ? CANONICAL_BACKUP_STORES
    : backup.formatVersion === 1 ? LEGACY_BACKUP_STORES_V1 : LEGACY_BACKUP_STORES_V2
  const expected = new Set(expectedStores)
  const actual = Object.keys(backup.stores)
  if (actual.length !== expected.size || actual.some(name => !expected.has(name))) throw new Error('Backup store set does not exactly match the supported KFE database.')
  for (const storeName of expected) {
    const records = backup.stores[storeName]
    if (!Array.isArray(records)) throw new Error(`Backup store ${storeName} must be an array.`)
    const ids = new Set()
    for (const record of records) { const validKey = storeName === 'financial_period_snapshots' ? typeof record?.periodKey === 'string' && /^\d{4}-\d{2}$/.test(record.periodKey) : typeof record?.id === 'string' && record.id.trim(); if (!record || typeof record !== 'object' || Array.isArray(record) || !validKey) throw new Error(`Backup store ${storeName} contains an invalid record.`); const key = storeName === 'financial_period_snapshots' ? record.periodKey : record.id; if (ids.has(key)) throw new Error(`Backup store ${storeName} contains duplicate id/key ${key}.`); ids.add(key) }
  }
  if (backup.formatVersion === 1 || backup.formatVersion === 2 || (backup.formatVersion === BACKUP_FORMAT_VERSION && sourceVersion === 11)) {
    const { driver_collected_data: _removed, ...storesWithoutRemovedStore } = backup.stores
    if (backup.formatVersion === 1) storesWithoutRemovedStore.audit_history = []
    if (!storesWithoutRemovedStore.financial_period_snapshots) storesWithoutRemovedStore.financial_period_snapshots = []
    backup = { ...backup, formatVersion: BACKUP_FORMAT_VERSION, source: { ...backup.source, dbVersion: 12 }, stores: storesWithoutRemovedStore }
  }
  return backup
}
export const createBackup = async () => validateBackup({ format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 12 }, exportedAt: new Date().toISOString(), stores: await backupRepository.readCanonicalSnapshot() })
export const serializeBackup = backup => JSON.stringify(validateBackup(backup), null, 2)
export const getBackupSummary = backup => { const valid = validateBackup(backup); const counts = Object.fromEntries(CANONICAL_BACKUP_STORES.map(store => [store, valid.stores[store].length])); return { exportedAt: valid.exportedAt, totalRecords: Object.values(counts).reduce((sum, count) => sum + count, 0), counts } }
export const saveLocalBackup = async backup => { const valid = validateBackup(backup); await backupRepository.saveLocalBackup(valid); return true }
export const getLocalBackup = async () => backupRepository.getLocalBackup()
export const restoreBackup = async input => { const backup = validateBackup(input); await backupRepository.restoreCanonicalSnapshot(backup.stores); await saveLocalBackup(backup); return getBackupSummary(backup) }
export const resetData = async () => { await backupRepository.resetCanonicalData(); return { ok: true } }
export const readBackupText = input => validateBackup(input)
export const requestLocalBackupCheckpoint = () => { checkpointRequested = true; if (checkpointTimer !== null) return; checkpointTimer = setTimeout(async () => { checkpointTimer = null; if (checkpointRunning || !checkpointRequested) return; checkpointRequested = false; checkpointRunning = true; try { await saveLocalBackup(await createBackup()) } catch (error) { console.warn('KFE local backup checkpoint failed:', error) } finally { checkpointRunning = false } }, 250) }
export const maybeDailyLocalBackup = async () => { const current = await getLocalBackup(); if (!current || Date.now() - Date.parse(current.savedAt) >= 24 * 60 * 60 * 1000) { const backup = await createBackup(); await saveLocalBackup(backup); return getBackupSummary(backup) } return getBackupSummary(current.backup) }
let checkpointTimer = null
let checkpointRunning = false
let checkpointRequested = false
let cloudProvider = null
export const registerCloudBackupProvider = provider => { if (!provider || typeof provider.upload !== 'function' || typeof provider.download !== 'function') throw new Error('Cloud backup provider must expose upload() and download().'); cloudProvider = provider; return provider.name || 'Cloud' }
export const getCloudBackupProviderName = () => cloudProvider?.name || null
export const backupToCloud = async backup => { if (!cloudProvider) throw new Error('No cloud backup provider is configured.'); return cloudProvider.upload(validateBackup(backup)) }
export const restoreFromCloud = async () => { if (!cloudProvider) throw new Error('No cloud backup provider is configured.'); const backup = validateBackup(await cloudProvider.download()); await restoreBackup(backup); return getBackupSummary(backup) }
export const BackupService = Object.freeze({ createBackup, validateBackup, serializeBackup, getBackupSummary, saveLocalBackup, getLocalBackup, restoreBackup, resetData, readBackupText, requestLocalBackupCheckpoint, maybeDailyLocalBackup, registerCloudBackupProvider, getCloudBackupProviderName, backupToCloud, restoreFromCloud })
