import { createBackupRepository, mergeCanonicalBackupSnapshot } from '../../repositories/backupRepository.js'
import { WorkRuntimePorts } from '../work/workRuntimePorts.js'
import { CANONICAL_DB_VERSION } from '../../constants/canonicalDatabase.js'
export const BACKUP_FORMAT = 'KFE_BACKUP'
export const BACKUP_FORMAT_VERSION = 5
const V4_BACKUP_STORES = Object.freeze(['financial_period_snapshots','settlements','shifts','fuel_logs','odoGaps','pending_mutations','days','trips','gps_snapshots','movement_artifacts','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','audit_history'])
export const CANONICAL_BACKUP_STORES = Object.freeze([...V4_BACKUP_STORES, 'locality_labels'])
const V3_BACKUP_STORES = Object.freeze(V4_BACKUP_STORES.filter(name => name !== 'settlements'))
const PRE_FA4_BACKUP_STORES = Object.freeze(['shifts','fuel_logs','odoGaps','pending_mutations','days','trips','gps_snapshots','movement_artifacts','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','audit_history'])
const LEGACY_BACKUP_STORES_V1 = Object.freeze([...PRE_FA4_BACKUP_STORES.filter(name => name !== 'audit_history').slice(0, 11), 'driver_collected_data', ...PRE_FA4_BACKUP_STORES.filter(name => name !== 'audit_history').slice(11)])
const LEGACY_BACKUP_STORES_V2 = Object.freeze([...PRE_FA4_BACKUP_STORES.slice(0, 11), 'driver_collected_data', ...PRE_FA4_BACKUP_STORES.slice(11)])
const backupRepository = createBackupRepository(CANONICAL_BACKUP_STORES)
export const validateBackup = input => {
  let backup = input
  if (typeof input === 'string') { try { backup = JSON.parse(input) } catch (_) { throw new Error('Backup file is not valid JSON.') } }
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('Backup must be a JSON object.')
  if (backup.format !== BACKUP_FORMAT) throw new Error('Unsupported KFE backup format.')
  if (![1, 2, 3, 4, BACKUP_FORMAT_VERSION].includes(backup.formatVersion)) throw new Error(`Unsupported backup format version: ${backup.formatVersion}.`)
  const sourceVersion = backup.source?.dbVersion
  const supportedSourceVersions = backup.formatVersion === 5 ? [12, 13, 15, 16, CANONICAL_DB_VERSION] : backup.formatVersion === 4 ? [12, 13, 15, 16] : backup.formatVersion === 3 ? [11, 12] : [8, 9]
  if (!backup.source || backup.source.dbName !== 'kanishka_kfe_canonical_db' || !supportedSourceVersions.includes(sourceVersion)) throw new Error('Backup source does not match a supported canonical KFE database version.')
  if (typeof backup.exportedAt !== 'string' || Number.isNaN(Date.parse(backup.exportedAt))) throw new Error('Backup exportedAt timestamp is invalid.')
  if (!backup.stores || typeof backup.stores !== 'object' || Array.isArray(backup.stores)) throw new Error('Backup stores section is missing.')
  const expectedStores = backup.formatVersion === 5 && sourceVersion === 12
    ? V3_BACKUP_STORES
    : backup.formatVersion === 5 ? CANONICAL_BACKUP_STORES
    : backup.formatVersion === 4 && sourceVersion === 12 ? V3_BACKUP_STORES
    : backup.formatVersion === 4 ? V4_BACKUP_STORES
    : backup.formatVersion === 3 ? V3_BACKUP_STORES
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
  if (backup.formatVersion < BACKUP_FORMAT_VERSION) {
    const { driver_collected_data: _removed, ...storesWithoutRemovedStore } = backup.stores
    if (backup.formatVersion === 1) storesWithoutRemovedStore.audit_history = []
    if (!storesWithoutRemovedStore.financial_period_snapshots) storesWithoutRemovedStore.financial_period_snapshots = []
    if (!storesWithoutRemovedStore.settlements) storesWithoutRemovedStore.settlements = []
    if (!storesWithoutRemovedStore.locality_labels) storesWithoutRemovedStore.locality_labels = []
    backup = { ...backup, formatVersion: BACKUP_FORMAT_VERSION, source: { ...backup.source, dbVersion: CANONICAL_DB_VERSION }, stores: storesWithoutRemovedStore }
  }
  return backup
}
const readAllNativeWorkRecords = async entityType => {
  const pageSize = 1000
  const records = []
  let offset = 0
  let expectedTotal = null
  do {
    const page = await WorkRuntimePorts.canonicalWork.listRecords({ entityType, limit: pageSize, offset })
    if (!Number.isInteger(page.totalCount) || page.totalCount < 0 || page.offset !== offset) {
      throw new Error(`Native ${entityType} backup pagination returned invalid count/offset metadata.`)
    }
    if (expectedTotal === null) expectedTotal = page.totalCount
    else if (page.totalCount !== expectedTotal) {
      throw new Error(`Native ${entityType} records changed during backup; retry after the current operation finishes.`)
    }
    if (page.records.length === 0 && offset < expectedTotal) {
      throw new Error(`Native ${entityType} backup stopped at ${offset} of ${expectedTotal} records; no partial backup was accepted.`)
    }
    records.push(...page.records)
    offset += page.records.length
    if (records.length > expectedTotal) throw new Error(`Native ${entityType} backup pagination returned duplicate/extra records.`)
  } while (offset < expectedTotal)
  if (records.length !== expectedTotal) {
    throw new Error(`Native ${entityType} backup is incomplete: expected ${expectedTotal}, read ${records.length}.`)
  }
  return records
}

const readNativeWorkSnapshot = async () => {
  if (!WorkRuntimePorts.canonicalWork.isAvailable()) return null
  const [shifts, trips] = await Promise.all([
    readAllNativeWorkRecords('SHIFT'),
    readAllNativeWorkRecords('TRIP'),
  ])
  return { shifts, trips }
}

const mergeBackupWorkIntoNative = async (backup, nativeSnapshot) => {
  if (!nativeSnapshot) return { added: 0, duplicates: 0, conflicts: 0 }
  const current = { shifts: nativeSnapshot.shifts || [], trips: nativeSnapshot.trips || [] }
  const incoming = { shifts: backup.stores.shifts || [], trips: backup.stores.trips || [] }
  const merged = mergeCanonicalBackupSnapshot(current, incoming, { sourceExportedAt: backup.exportedAt })
  let added = 0
  for (const [storeName, entityType] of [['shifts', 'SHIFT'], ['trips', 'TRIP'], ['gps_snapshots', 'GPS_SNAPSHOT']]) {
    for (const record of merged.addedRecordsByStore[storeName] || []) {
      const operationId = `backup-restore:${backup.exportedAt}:${entityType}:${record.id}`
      try {
        await WorkRuntimePorts.canonicalWork.putRecord({ operationId, entityType, record, expectAbsent: true })
        added++
      } catch (error) {
        // A process death/lost acknowledgement may occur after SQLite commits.
        // Verify the same record identity before deciding whether retry is safe.
        const [verified, operation] = await Promise.all([
          WorkRuntimePorts.canonicalWork.getRecord({ entityType, entityId: record.id }),
          WorkRuntimePorts.canonicalWork.getOperation(operationId),
        ])
        const sameCommittedOperation = operation?.found === true
          && operation.command === 'PUT_RECORD'
          && operation.entityType === entityType
          && operation.entityId === record.id
        if (sameCommittedOperation) continue
        if (!verified?.found) throw new Error(`Native restore stopped at ${entityType}/${record.id}; retry the same backup to resume safely. ${error?.message || ''}`)
        if (JSON.stringify(verified.record) !== JSON.stringify(record)) {
          throw new Error(`Native restore found a conflicting canonical ${entityType}/${record.id}; current data was preserved. Retry after reviewing the conflict.`)
        }
      }
    }
  }
  return { added, duplicates: merged.duplicates, conflicts: merged.conflicts }
}

export const createBackup = async () => {
  const exportedAt = new Date().toISOString()
  const browserSnapshot = await backupRepository.readCanonicalSnapshot()
  const nativeSnapshot = await readNativeWorkSnapshot()
  let stores = browserSnapshot
  if (nativeSnapshot) {
    // Native SQLite records are authoritative on Android. Preserve browser-only
    // history while making sure native-only work records are included in export.
    const current = { ...browserSnapshot, shifts: nativeSnapshot.shifts, trips: nativeSnapshot.trips, gps_snapshots: nativeSnapshot.gps_snapshots }
    stores = mergeCanonicalBackupSnapshot(current, browserSnapshot, { sourceExportedAt: exportedAt }).snapshot
  }
  return validateBackup({ format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: CANONICAL_DB_VERSION }, exportedAt, stores })
}
export const serializeBackup = backup => JSON.stringify(validateBackup(backup), null, 2)
export const getBackupSummary = backup => { const valid = validateBackup(backup); const counts = Object.fromEntries(CANONICAL_BACKUP_STORES.map(store => [store, valid.stores[store].length])); return { exportedAt: valid.exportedAt, totalRecords: Object.values(counts).reduce((sum, count) => sum + count, 0), counts } }
export const saveLocalBackup = async backup => { const valid = validateBackup(backup); await backupRepository.saveLocalBackup(valid); return true }
export const getLocalBackup = async () => backupRepository.getLocalBackup()
const applyRestoreBackup = async backup => {
  const beforeNative = await readNativeWorkSnapshot()
  const nativeMerge = await mergeBackupWorkIntoNative(backup, beforeNative)
  const afterNative = await readNativeWorkSnapshot()
  const merge = await backupRepository.restoreCanonicalSnapshot(backup.stores, {
    sourceExportedAt: backup.exportedAt,
    authoritativeRecords: afterNative,
  })
  // The restore journal remains durable until both stores have converged and the
  // resulting merged snapshot has been checkpointed successfully.
  await saveLocalBackup(await createBackup())
  return { ...getBackupSummary(backup), merge: { ...merge, native: nativeMerge } }
}

const runRestoreBackup = async input => {
  if (backupRepository.getCanonicalResetBarrier()) throw new Error('Backup restore is blocked while a canonical reset is pending.')
  const backup = validateBackup(input)
  const existing = await backupRepository.getRestoreJournal()
  if (existing?.backup && serializeBackup(existing.backup) !== serializeBackup(backup)) {
    throw new Error('A different restore is pending recovery. Reopen KFE and let the pending restore finish before starting another restore.')
  }
  const restoreId = existing?.restoreId || globalThis.crypto?.randomUUID?.() || `restore-${Date.now()}-${Math.random().toString(36).slice(2)}`
  await backupRepository.saveRestoreJournal({ id: 'current', restoreId, state: 'APPLYING', backup })
  const result = await applyRestoreBackup(backup)
  await backupRepository.clearRestoreJournal(restoreId)
  return result
}

let activeRestoreAttempt = null
export const restoreBackup = input => {
  if (activeRestoreAttempt) return Promise.reject(new Error('A backup restore is already running. Wait for it to finish before starting another restore.'))
  activeRestoreAttempt = runRestoreBackup(input).finally(() => { activeRestoreAttempt = null })
  return activeRestoreAttempt
}

export const recoverPendingRestore = async () => {
  const journal = await backupRepository.getRestoreJournal()
  if (!journal) return { recovered: false, state: null }
  if (journal.id !== 'current' || !journal.restoreId || !journal.backup) {
    throw new Error('Pending restore journal is invalid; startup is blocked to protect recoverable data.')
  }
  const backup = validateBackup(journal.backup)
  const result = await applyRestoreBackup(backup)
  await backupRepository.clearRestoreJournal(journal.restoreId)
  return { recovered: true, restoreId: journal.restoreId, ...result }
}
const RESET_TERMINAL_STATES = new Set(['COMPLETE', 'ABORTED'])

const assertNoActiveShift = checkpoint => {
  const activeShift = (checkpoint?.stores?.shifts || []).find(shift => String(shift?.status || '').toUpperCase() === 'ACTIVE')
  if (activeShift) throw new Error('Reset is blocked while a shift is active; end it through the PWA workflow first.')
}

const verifyResetCheckpoint = async (checkpoint, resetId) => {
  const saved = await backupRepository.getResetCheckpoint(resetId)
  if (!saved?.backup || saved.backup.exportedAt !== checkpoint.exportedAt) {
    throw new Error('Reset stopped before deletion because the recovery checkpoint could not be verified.')
  }
  const expectedCounts = getBackupSummary(checkpoint).counts
  const savedCounts = getBackupSummary(saved.backup).counts
  if (JSON.stringify(expectedCounts) !== JSON.stringify(savedCounts)) {
    throw new Error('Reset stopped before deletion because the recovery checkpoint record counts do not match.')
  }
}

const continueReset = async resetId => {
  let journal = await backupRepository.getResetJournal()
  if (!journal || journal.id !== 'current' || journal.resetId !== resetId) {
    throw new Error('Reset recovery journal is missing or does not match the pending reset ID.')
  }
  if (RESET_TERMINAL_STATES.has(journal.state)) {
    if (journal.state === 'COMPLETE') backupRepository.clearCanonicalResetBarrier(resetId)
    return { ok: journal.state === 'COMPLETE', resetId, state: journal.state }
  }
  const nativeAvailable = WorkRuntimePorts.canonicalWork.isAvailable()
  if (journal.nativeRequired && !nativeAvailable) {
    throw new Error('Reset recovery is blocked because the native canonical store is unavailable.')
  }

  try {
    if (nativeAvailable) {
      const nativeState = await WorkRuntimePorts.canonicalWork.getCanonicalResetState()
      if (!nativeState?.found || nativeState.resetId !== resetId) {
        await WorkRuntimePorts.canonicalWork.beginCanonicalReset(resetId)
      }
    }

    // Repeat this idempotent clear on recovery even if the journal update was
    // interrupted after the IndexedDB transaction committed.
    await backupRepository.resetCanonicalData({ resetId })
    journal = { ...journal, state: 'BROWSER_CLEARED' }
    await backupRepository.saveResetJournal(journal)

    if (nativeAvailable) {
      await WorkRuntimePorts.canonicalWork.clearCanonicalReset(resetId)
      journal = { ...journal, state: 'NATIVE_CLEARED' }
      await backupRepository.saveResetJournal(journal)
    }

    const after = await createBackup()
    if (getBackupSummary(after).totalRecords !== 0) {
      throw new Error('Browser canonical reset verification failed; recoverable records remain.')
    }
    const canonicalVerification = await backupRepository.verifyCanonicalReset()
    if (canonicalVerification.ok !== true) {
      throw new Error('Browser canonical reset verification failed; records remain in one or more canonical stores.')
    }

    // Keep native writes blocked until the browser store has also been verified.
    if (nativeAvailable) {
      await WorkRuntimePorts.canonicalWork.completeCanonicalReset(resetId)
      const nativeState = await WorkRuntimePorts.canonicalWork.getCanonicalResetState()
      if (nativeState?.found !== true || nativeState.resetId !== resetId || nativeState.state !== 'COMPLETE') {
        throw new Error('Native canonical reset could not be verified.')
      }
    }
    // Reset session-scoped preferences to the canonical production source as well.
    backupRepository.resetSessionPreferencesToDefaults()
    journal = { ...journal, state: 'COMPLETE', completedAt: new Date().toISOString() }
    await backupRepository.saveResetJournal(journal)
    backupRepository.clearCanonicalResetBarrier(resetId)
    if (nativeAvailable) {
      try {
        await WorkRuntimePorts.canonicalWork.releaseCanonicalReset(resetId)
      } catch (error) {
        // If native release acknowledgement is uncertain, restore the browser
        // barrier so neither interface can mutate while reset completion is unclear.
        backupRepository.setCanonicalResetBarrier(resetId)
        throw error
      }
    }
    return { ok: true, resetId, state: 'COMPLETE' }
  } catch (error) {
    // Keep the barrier and journal intact on uncertain outcomes. Startup retries
    // the same reset ID before normal mutation replay is allowed.
    throw error
  }
}

const runResetData = async () => {
  if (activeRestoreAttempt) throw new Error('Data reset is blocked while a backup restore is running.')
  await recoverPendingReset()
  await recoverPendingRestore()
  const resetId = globalThis.crypto?.randomUUID?.() || `reset-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const nativeRequired = WorkRuntimePorts.canonicalWork.isAvailable()
  backupRepository.setCanonicalResetBarrier(resetId)
  await backupRepository.saveResetJournal({
    id: 'current',
    resetId,
    state: 'CHECKPOINTING',
    nativeRequired,
    startedAt: new Date().toISOString(),
  })

  let checkpoint
  try {
    // Freeze new canonical writes before taking the checkpoint so it represents
    // the complete pre-reset dataset rather than a moving target.
    checkpoint = await createBackup()
    assertNoActiveShift(checkpoint)
    await backupRepository.saveResetCheckpoint(resetId, checkpoint)
    await verifyResetCheckpoint(checkpoint, resetId)
    await backupRepository.saveResetJournal({
      id: 'current',
      resetId,
      state: 'PREPARED',
      nativeRequired,
      checkpointExportedAt: checkpoint.exportedAt,
      startedAt: new Date().toISOString(),
    })
  } catch (error) {
    await backupRepository.saveResetJournal({
      id: 'current', resetId, state: 'ABORTED', nativeRequired,
      reason: /active shift/i.test(error?.message || '') ? 'ACTIVE_SHIFT' : 'CHECKPOINT_FAILED',
    })
    backupRepository.clearCanonicalResetBarrier(resetId)
    throw error
  }

  try {
    return await continueReset(resetId)
  } catch (error) {
    if (/blocked while a shift is active/i.test(error?.message || '')) {
      await backupRepository.saveResetJournal({ id: 'current', resetId, state: 'ABORTED', nativeRequired, reason: 'ACTIVE_SHIFT', checkpointExportedAt: checkpoint.exportedAt })
      backupRepository.clearCanonicalResetBarrier(resetId)
    }
    throw error
  }
}

let activeResetAttempt = null
export const resetData = () => {
  if (activeResetAttempt) return activeResetAttempt
  activeResetAttempt = runResetData().finally(() => { activeResetAttempt = null })
  return activeResetAttempt
}

export const recoverPendingReset = async () => {
  let journal = await backupRepository.getResetJournal()
  const barrierId = backupRepository.getCanonicalResetBarrier()
  const nativeAvailable = WorkRuntimePorts.canonicalWork.isAvailable()
  // Recover even if the browser marker/journal was interrupted but SQLite has
  // a durable pending reset. Never resume destructive work without its checkpoint.
  if (!journal && !barrierId && nativeAvailable) {
    const nativeState = await WorkRuntimePorts.canonicalWork.getCanonicalResetState()
    if (nativeState?.found && nativeState.state !== 'COMPLETE') {
      const checkpoint = await backupRepository.getResetCheckpoint(nativeState.resetId)
      if (!checkpoint?.backup) throw new Error('Native reset is pending but its browser recovery checkpoint is missing; startup is blocked.')
      journal = {
        id: 'current',
        resetId: nativeState.resetId,
        state: nativeState.state === 'CLEARED' ? 'NATIVE_CLEARED' : 'PREPARED',
        nativeRequired: true,
        checkpointExportedAt: checkpoint.backup.exportedAt,
        recoveredJournalAfterCrash: true,
      }
      await backupRepository.saveResetJournal(journal)
    }
  }
  if (!journal && barrierId) {
    const checkpoint = await backupRepository.getResetCheckpoint(barrierId)
    if (!checkpoint?.backup) {
      const nativeState = nativeAvailable ? await WorkRuntimePorts.canonicalWork.getCanonicalResetState() : null
      if (nativeState?.found && nativeState.resetId === barrierId && nativeState.state !== 'COMPLETE') {
        throw new Error('Reset barrier and native reset are pending but the verified recovery checkpoint is missing; startup is blocked.')
      }
      // A crash before the checkpoint was committed cannot have reached either
      // destructive clear phase, so safely release this abandoned preparation.
      await backupRepository.saveResetJournal({ id: 'current', resetId: barrierId, state: 'ABORTED', nativeRequired: nativeAvailable, reason: 'CHECKPOINT_NOT_CREATED' })
      backupRepository.clearCanonicalResetBarrier(barrierId)
      return { recovered: false, state: 'ABORTED' }
    }
    journal = {
      id: 'current',
      resetId: barrierId,
      state: 'PREPARED',
      nativeRequired: nativeAvailable,
      checkpointExportedAt: checkpoint.backup.exportedAt,
      recoveredJournalAfterCrash: true,
    }
    await backupRepository.saveResetJournal(journal)
  }
  if (journal?.state === 'CHECKPOINTING') {
    const nativeState = nativeAvailable ? await WorkRuntimePorts.canonicalWork.getCanonicalResetState() : null
    if (nativeState?.found && nativeState.resetId === journal.resetId && nativeState.state !== 'COMPLETE') {
      throw new Error('Native reset began before the checkpointing phase completed; startup is blocked for manual recovery.')
    }
    await backupRepository.saveResetJournal({ ...journal, state: 'ABORTED', reason: 'CHECKPOINT_INTERRUPTED' })
    if (backupRepository.getCanonicalResetBarrier() === journal.resetId) backupRepository.clearCanonicalResetBarrier(journal.resetId)
    return { recovered: false, state: 'ABORTED' }
  }
  if (!journal || RESET_TERMINAL_STATES.has(journal.state)) {
    if (journal && barrierId && barrierId !== journal.resetId) {
      throw new Error('Reset barrier ID does not match the durable reset journal; startup is blocked.')
    }
    if (journal?.state === 'COMPLETE' && journal.nativeRequired && nativeAvailable) {
      if (barrierId === journal.resetId) backupRepository.clearCanonicalResetBarrier(journal.resetId)
      try {
        await WorkRuntimePorts.canonicalWork.releaseCanonicalReset(journal.resetId)
      } catch (error) {
        backupRepository.setCanonicalResetBarrier(journal.resetId)
        throw error
      }
    } else if (journal && barrierId === journal.resetId) {
      backupRepository.clearCanonicalResetBarrier(journal.resetId)
    }
    return { recovered: false, state: journal?.state || null }
  }
  if (barrierId !== journal.resetId) backupRepository.setCanonicalResetBarrier(journal.resetId)
  const checkpoint = await backupRepository.getResetCheckpoint(journal.resetId)
  if (!checkpoint?.backup || checkpoint.backup.exportedAt !== journal.checkpointExportedAt) {
    throw new Error('Pending reset cannot resume because its verified recovery checkpoint is missing or changed.')
  }
  const result = await continueReset(journal.resetId)
  return { recovered: true, ...result }
}
export const readBackupText = input => validateBackup(input)
export const requestLocalBackupCheckpoint = () => { checkpointRequested = true; if (checkpointTimer !== null) return; checkpointTimer = setTimeout(async () => { checkpointTimer = null; if (checkpointRunning || !checkpointRequested) return; checkpointRequested = false; checkpointRunning = true; try { await saveLocalBackup(await createBackup()) } catch (error) { console.warn('KFE local backup checkpoint failed:', error) } finally { checkpointRunning = false } }, 250) }
export const maybeDailyLocalBackup = async () => { const current = await getLocalBackup(); if (!current || Date.now() - Date.parse(current.savedAt) >= 24 * 60 * 60 * 1000) { const backup = await createBackup(); await saveLocalBackup(backup); return getBackupSummary(backup) } return getBackupSummary(current.backup) }
let checkpointTimer = null
let checkpointRunning = false
let checkpointRequested = false
export const BackupService = Object.freeze({ createBackup, validateBackup, serializeBackup, getBackupSummary, saveLocalBackup, getLocalBackup, restoreBackup, recoverPendingRestore, resetData, recoverPendingReset, readBackupText, requestLocalBackupCheckpoint, maybeDailyLocalBackup })
