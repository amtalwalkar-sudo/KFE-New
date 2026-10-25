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
      if (!byKey.has(key)) {
        const copy = structuredClone(imported)
        byKey.set(key, current.length)
        current.push(copy)
        additions.push(copy)
        added++
        continue
      }
      const existing = current[byKey.get(key)]
      if (sameBackupValue(existing, imported)) {
        duplicates++
        continue
      }
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
            // On Android, SQLite is authoritative for overlay work records. Merge
            // its current SHIFT/TRIP records with the browser snapshot before the
            // imported backup so a stale backup cannot replace native truth.
            const authoritativeSnapshot = { ...currentSnapshot }
            if (Array.isArray(authoritativeRecords?.shifts)) authoritativeSnapshot.shifts = authoritativeRecords.shifts
            if (Array.isArray(authoritativeRecords?.trips)) authoritativeSnapshot.trips = authoritativeRecords.trips
            const combinedIncoming = Object.fromEntries(stores.map(name => [name, [
              ...(currentSnapshot[name] || []),
              ...(name === 'shifts' ? (authoritativeRecords?.shifts || []) : []),
              ...(name === 'trips' ? (authoritativeRecords?.trips || []) : []),
              ...(snapshot[name] || []),
            ]]))
            const merged = mergeCanonicalBackupSnapshot(authoritativeSnapshot, combinedIncoming, { sourceExportedAt })
            for (const storeName of stores) {
              const store = tx.objectStore(storeName)
              for (const record of merged.addedRecordsByStore[storeName] || []) store.add(structuredClone(record))
            }
            restoreSummary = {
              added: merged.added,
              duplicates: merged.duplicates,
              conflicts: merged.conflicts,
              archivedConflicts: merged.archivedConflicts,
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
