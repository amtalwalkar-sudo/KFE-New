import { openCanonicalDB, notifyCanonicalDataChanged, withCanonicalResetWritePermission, setCanonicalResetBarrier, getCanonicalResetBarrier, clearCanonicalResetBarrier, setActiveDataSource } from '../utils/indexedDB.js'

export const LOCAL_BACKUP_DB_NAME = 'kanishka_kfe_local_backup_db'
export const LOCAL_BACKUP_DB_VERSION = 3
export const LOCAL_BACKUP_ID = 'current'

const openLocalBackupDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(LOCAL_BACKUP_DB_NAME, LOCAL_BACKUP_DB_VERSION)
  request.onupgradeneeded = event => {
    const db = event.target.result
    if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('reset_journal')) db.createObjectStore('reset_journal', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('restore_journal')) db.createObjectStore('restore_journal', { keyPath: 'id' })
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error || new Error('Local backup storage could not be opened.'))
})


const canonicalizeBackupValue = value => {
  if (Array.isArray(value)) return value.map(canonicalizeBackupValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalizeBackupValue(value[key])]))
  return value
}
const sameBackupValue = (left, right) => JSON.stringify(canonicalizeBackupValue(left)) === JSON.stringify(canonicalizeBackupValue(right))
const backupKey = (storeName, record) => storeName === 'financial_period_snapshots' ? record?.periodKey : record?.id
const stableHash = value => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Loss-protecting restore policy: union records by their canonical key, dedupe
 * identical records, keep the current value for same-key conflicts, and archive
 * the imported conflicting payload as a durable audit entry.
 */
export const mergeCanonicalBackupSnapshot = (currentSnapshot, incomingSnapshot, { sourceExportedAt = null } = {}) => {
  const snapshot = {}
  const addedRecordsByStore = {}
  const conflictArchives = []
  let added = 0, duplicates = 0, conflicts = 0
  for (const storeName of Object.keys(incomingSnapshot || {})) {
    const current = [...(currentSnapshot?.[storeName] || [])].map(record => structuredClone(record))
    const byKey = new Map(current.map((record, index) => [backupKey(storeName, record), index]))
    const additions = []
    for (const imported of incomingSnapshot[storeName] || []) {
      const key = backupKey(storeName, imported)
      const competingActiveShift = storeName === 'shifts'
        && String(imported?.status || '').toUpperCase() === 'ACTIVE'
        && current.some(existing => String(existing?.status || '').toUpperCase() === 'ACTIVE' && existing.id !== imported.id)
      if (!byKey.has(key) && !competingActiveShift) {
        const copy = structuredClone(imported)
        byKey.set(key, current.length)
        current.push(copy)
        additions.push(copy)
        added++
        continue
      }
      if (byKey.has(key) && sameBackupValue(current[byKey.get(key)], imported)) {
        duplicates++
        continue
      }
      // Never restore a second ACTIVE shift under a different ID. Archive it
      // just like a same-ID payload conflict so no operational state is lost.
      conflicts++
      const importedPayload = JSON.stringify(canonicalizeBackupValue(imported))
      const conflictId = `restore-conflict:${storeName}:${stableHash(JSON.stringify([storeName, key, importedPayload]))}`
      conflictArchives.push({
        id: conflictId,
        entityType: storeName,
        entityId: String(key),
        action: 'RESTORE_CONFLICT_ARCHIVE',
        source: 'BACKUP_RESTORE',
        sourceExportedAt,
        payload: structuredClone(imported),
        createdAt: new Date().toISOString(),
      })
    }
    snapshot[storeName] = current
    addedRecordsByStore[storeName] = additions
  }
  if (snapshot.audit_history) {
    const auditIds = new Set(snapshot.audit_history.map(record => record.id))
    const additions = addedRecordsByStore.audit_history || (addedRecordsByStore.audit_history = [])
    for (const archive of conflictArchives) {
      if (auditIds.has(archive.id)) continue
      auditIds.add(archive.id)
      snapshot.audit_history.push(archive)
      additions.push(archive)
      added++
    }
  }
  return { snapshot, addedRecordsByStore, added, duplicates, conflicts, archivedConflicts: conflictArchives.length }
}

export const createBackupRepository = stores => Object.freeze({
  setCanonicalResetBarrier(resetId) { return setCanonicalResetBarrier(resetId) },
  getCanonicalResetBarrier() { return getCanonicalResetBarrier() },
  clearCanonicalResetBarrier(resetId) { return clearCanonicalResetBarrier(resetId) },
  resetSessionPreferencesToDefaults() { return setActiveDataSource('canonical') },
  async readCanonicalSnapshot() {
    const db = await openCanonicalDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readonly')
      const result = {}
      let remaining = stores.length
      let settled = false
      const fail = error => { if (settled) return; settled = true; try { tx.abort() } catch (_) {}; reject(error) }
      for (const storeName of stores) {
        const request = tx.objectStore(storeName).getAll()
        request.onsuccess = () => {
          result[storeName] = request.result || []
          remaining -= 1
          if (remaining === 0 && !settled) { settled = true; resolve(result) }
        }
        request.onerror = () => fail(request.error || new Error(`Backup read failed for ${storeName}.`))
      }
      tx.onerror = () => fail(tx.error || new Error('Backup snapshot transaction failed.'))
      tx.onabort = () => { if (!settled) { settled = true; reject(tx.error || new Error('Backup snapshot transaction aborted.')) } }
    })
  },

  async restoreCanonicalSnapshot(snapshot, { sourceExportedAt = null, authoritativeRecords = null } = {}) {
    const db = await openCanonicalDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite')
      const currentSnapshot = {}
      let remaining = stores.length
      let settled = false
      let restoreSummary = null
      const fail = error => { if (settled) return; settled = true; try { tx.abort() } catch (_) {}; reject(error) }
      for (const storeName of stores) {
        const request = tx.objectStore(storeName).getAll()
        request.onsuccess = () => {
          currentSnapshot[storeName] = request.result || []
          remaining--
          if (remaining !== 0 || settled) return
          try {
            // On Android, SQLite is authoritative for SHIFT/TRIP. Reconcile the
            // browser mirror against it first; archive any same-ID browser payload
            // that differs, then apply the imported backup using the loss-protecting
            // union policy. Native records are put transactionally into IndexedDB
            // so native-only records are not accidentally omitted from the mirror.
            const authoritativeSnapshot = { ...currentSnapshot }
            const nativeConflictArchives = []
            let nativeMirrorAdded = 0
            for (const storeName of ['shifts', 'trips']) {
              if (!Array.isArray(authoritativeRecords?.[storeName])) continue
              const nativeRecords = authoritativeRecords[storeName].map(record => structuredClone(record))
              const nativeByKey = new Map(nativeRecords.map(record => [backupKey(storeName, record), record]))
              const browserOnly = []
              for (const browserRecord of currentSnapshot[storeName] || []) {
                const key = backupKey(storeName, browserRecord)
                if (!nativeByKey.has(key)) {
                  const competingActiveShift = storeName === 'shifts'
                    && String(browserRecord?.status || '').toUpperCase() === 'ACTIVE'
                    && nativeRecords.some(record => String(record?.status || '').toUpperCase() === 'ACTIVE' && record.id !== browserRecord.id)
                  if (competingActiveShift) {
                    const importedPayload = JSON.stringify(canonicalizeBackupValue(browserRecord))
                    const conflictId = `restore-conflict:${storeName}:${stableHash(JSON.stringify([storeName, key, importedPayload]))}`
                    nativeConflictArchives.push({
                      id: conflictId, entityType: storeName, entityId: String(key),
                      action: 'RESTORE_CONFLICT_ARCHIVE', source: 'BACKUP_RESTORE',
                      sourceExportedAt, payload: structuredClone(browserRecord), createdAt: new Date().toISOString(),
                    })
                  } else {
                    browserOnly.push(structuredClone(browserRecord))
                  }
                  continue
                }
                const nativeRecord = nativeByKey.get(key)
                if (sameBackupValue(nativeRecord, browserRecord)) continue
                const importedPayload = JSON.stringify(canonicalizeBackupValue(browserRecord))
                const conflictId = `restore-conflict:${storeName}:${stableHash(JSON.stringify([storeName, key, importedPayload]))}`
                nativeConflictArchives.push({
                  id: conflictId, entityType: storeName, entityId: String(key),
                  action: 'RESTORE_CONFLICT_ARCHIVE', source: 'BACKUP_RESTORE',
                  sourceExportedAt, payload: structuredClone(browserRecord), createdAt: new Date().toISOString(),
                })
              }
              nativeMirrorAdded += nativeRecords.filter(record =>
                !(currentSnapshot[storeName] || []).some(existing => backupKey(storeName, existing) === backupKey(storeName, record))
              ).length
              authoritativeSnapshot[storeName] = [...nativeRecords, ...browserOnly]
            }
            if (authoritativeSnapshot.audit_history) {
              const auditIds = new Set(authoritativeSnapshot.audit_history.map(record => record.id))
              for (const archive of nativeConflictArchives) {
                if (auditIds.has(archive.id)) continue
                auditIds.add(archive.id)
                authoritativeSnapshot.audit_history.push(archive)
              }
            }
            const merged = mergeCanonicalBackupSnapshot(authoritativeSnapshot, snapshot, { sourceExportedAt })
            const currentAuditIds = new Set((currentSnapshot.audit_history || []).map(record => record.id))
            const nativeArchiveAdds = nativeConflictArchives.filter((record, index, all) =>
              !currentAuditIds.has(record.id) && all.findIndex(candidate => candidate.id === record.id) === index
            )
            for (const storeName of stores) {
              const store = tx.objectStore(storeName)
              if (['shifts', 'trips'].includes(storeName) && Array.isArray(authoritativeRecords?.[storeName])) {
                for (const record of authoritativeSnapshot[storeName]) store.put(structuredClone(record))
              }
              for (const record of merged.addedRecordsByStore[storeName] || []) store.add(structuredClone(record))
            }
            if (nativeArchiveAdds.length && !stores.includes('audit_history')) {
              throw new Error('Restore conflict preservation requires the audit_history store in the canonical transaction.')
            }
            if (stores.includes('audit_history')) {
              const auditStore = tx.objectStore('audit_history')
              for (const archive of nativeArchiveAdds) auditStore.add(structuredClone(archive))
            }
            const nativeArchivesAdded = nativeArchiveAdds.length
            restoreSummary = {
              added: merged.added + nativeMirrorAdded + nativeArchivesAdded,
              duplicates: merged.duplicates,
              conflicts: merged.conflicts + nativeConflictArchives.length,
              archivedConflicts: merged.archivedConflicts + nativeArchivesAdded,
            }
          } catch (error) { fail(error) }
        }
        request.onerror = () => fail(request.error || new Error(`Restore merge read failed for ${storeName}.`))
      }
      tx.oncomplete = () => {
        if (settled) return
        settled = true
        notifyCanonicalDataChanged({ stores, reason: 'backup:restore-merge' })
        resolve(restoreSummary || { added: 0, duplicates: 0, conflicts: 0, archivedConflicts: 0 })
      }
      tx.onerror = () => fail(tx.error || new Error('KFE restore transaction failed.'))
      tx.onabort = () => { if (!settled) { settled = true; reject(tx.error || new Error('KFE restore transaction aborted.')) } }
    })
  },

  async resetCanonicalData({ resetId } = {}) {
    if (!resetId) throw new Error('A durable reset ID is required.')
    const db = await openCanonicalDB()
    // Reset means factory defaults: clear persisted preferences as well as business
    // records. The reset journal and recovery checkpoint live in the separate backup DB.
    const resetStores = [...new Set([...stores, 'form_drafts', 'canonical_operations'])]
    await new Promise((resolve, reject) => {
      let tx
      try {
        tx = withCanonicalResetWritePermission(resetId, () => db.transaction(resetStores, 'readwrite'))
        for (const storeName of resetStores) tx.objectStore(storeName).clear()
      } catch (error) { try { tx?.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: resetStores, reason: 'data:reset' }); resolve() }
      tx.onerror = () => reject(tx.error || new Error('KFE data reset transaction failed.'))
      tx.onabort = () => reject(tx.error || new Error('KFE data reset transaction aborted.'))
    })
  },

  async verifyCanonicalReset() {
    const resetStores = [...new Set([...stores, 'form_drafts', 'canonical_operations'])]
    const db = await openCanonicalDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(resetStores, 'readonly')
      const counts = {}
      let remaining = resetStores.length
      let settled = false
      const finish = () => {
        if (settled || remaining !== 0) return
        settled = true
        resolve({ ok: Object.values(counts).every(count => count === 0), counts })
      }
      for (const storeName of resetStores) {
        const request = tx.objectStore(storeName).count()
        request.onsuccess = () => { counts[storeName] = request.result; remaining -= 1; finish() }
        request.onerror = () => { if (!settled) { settled = true; reject(request.error || new Error(`Reset verification read failed for ${storeName}.`)) } }
      }
      tx.onerror = () => { if (!settled) { settled = true; reject(tx.error || new Error('Reset verification transaction failed.')) } }
      tx.onabort = () => { if (!settled) { settled = true; reject(tx.error || new Error('Reset verification transaction aborted.')) } }
    })
  },

  async saveResetJournal(journal) {
    if (!journal?.id || !journal?.state) throw new Error('Reset journal requires id and state.')
    const db = await openLocalBackupDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reset_journal', 'readwrite')
      tx.objectStore('reset_journal').put({ ...journal, updatedAt: new Date().toISOString() })
      tx.oncomplete = () => { db.close(); resolve(true) }
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Reset journal write failed.')) }
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Reset journal write aborted.')) }
    })
  },

  async getResetJournal() {
    const db = await openLocalBackupDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('reset_journal', 'readonly')
      const request = tx.objectStore('reset_journal').get('current')
      request.onsuccess = () => { const result = request.result || null; db.close(); resolve(result) }
      request.onerror = () => { db.close(); reject(request.error || new Error('Reset journal lookup failed.')) }
    })
  },

  async saveRestoreJournal(journal) {
    if (!journal?.id || !journal?.restoreId || !journal?.backup) throw new Error('Restore journal requires a restore ID and validated backup.')
    const db = await openLocalBackupDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('restore_journal', 'readwrite')
      tx.objectStore('restore_journal').put({ ...journal, updatedAt: new Date().toISOString() })
      tx.oncomplete = () => { db.close(); resolve(true) }
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Restore journal write failed.')) }
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Restore journal write aborted.')) }
    })
  },

  async getRestoreJournal() {
    const db = await openLocalBackupDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('restore_journal', 'readonly')
      const request = tx.objectStore('restore_journal').get('current')
      request.onsuccess = () => { const result = request.result || null; db.close(); resolve(result) }
      request.onerror = () => { db.close(); reject(request.error || new Error('Restore journal lookup failed.')) }
    })
  },

  async clearRestoreJournal(restoreId) {
    if (!restoreId) throw new Error('Restore ID is required to clear the journal.')
    const db = await openLocalBackupDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('restore_journal', 'readwrite')
      const store = tx.objectStore('restore_journal')
      const request = store.get('current')
      request.onsuccess = () => {
        if (request.result && request.result.restoreId === restoreId) store.delete('current')
      }
      tx.oncomplete = () => { db.close(); resolve(true) }
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Restore journal clear failed.')) }
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Restore journal clear aborted.')) }
    })
  },

  async saveLocalBackup(backup) {
    const db = await openLocalBackupDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite')
      tx.objectStore('snapshots').put({ id: LOCAL_BACKUP_ID, savedAt: new Date().toISOString(), backup })
      tx.oncomplete = () => { db.close(); resolve(true) }
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Local backup save failed.')) }
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Local backup save aborted.')) }
    })
  },

  async getLocalBackup() {
    const db = await openLocalBackupDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly')
      const request = tx.objectStore('snapshots').get(LOCAL_BACKUP_ID)
      request.onsuccess = () => { db.close(); resolve(request.result || null) }
      request.onerror = () => { db.close(); reject(request.error || new Error('Local backup lookup failed.')) }
    })
  },

  async saveResetCheckpoint(resetId, backup) {
    if (!resetId || !backup) throw new Error('Reset ID and checkpoint backup are required.')
    const db = await openLocalBackupDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite')
      tx.objectStore('snapshots').put({ id: `reset:${resetId}`, savedAt: new Date().toISOString(), backup })
      tx.oncomplete = () => { db.close(); resolve(true) }
      tx.onerror = () => { db.close(); reject(tx.error || new Error('Reset checkpoint write failed.')) }
      tx.onabort = () => { db.close(); reject(tx.error || new Error('Reset checkpoint write aborted.')) }
    })
  },

  async getResetCheckpoint(resetId) {
    if (!resetId) throw new Error('Reset ID is required.')
    const db = await openLocalBackupDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly')
      const request = tx.objectStore('snapshots').get(`reset:${resetId}`)
      request.onsuccess = () => { db.close(); resolve(request.result || null) }
      request.onerror = () => { db.close(); reject(request.error || new Error('Reset checkpoint lookup failed.')) }
    })
  },
})
