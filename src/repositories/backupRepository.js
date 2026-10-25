import { openCanonicalDB, notifyCanonicalDataChanged } from '../utils/indexedDB.js'

export const LOCAL_BACKUP_DB_NAME = 'kanishka_kfe_local_backup_db'
export const LOCAL_BACKUP_DB_VERSION = 1
export const LOCAL_BACKUP_ID = 'current'

const openLocalBackupDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(LOCAL_BACKUP_DB_NAME, LOCAL_BACKUP_DB_VERSION)
  request.onupgradeneeded = event => {
    const db = event.target.result
    if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' })
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

  async restoreCanonicalSnapshot(snapshot, { sourceExportedAt = null } = {}) {
    const db = await openCanonicalDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite')
      const currentSnapshot = {}
      let remaining = stores.length
      let settled = false
      const fail = error => { if (settled) return; settled = true; try { tx.abort() } catch (_) {}; reject(error) }
      for (const storeName of stores) {
        const request = tx.objectStore(storeName).getAll()
        request.onsuccess = () => {
          currentSnapshot[storeName] = request.result || []
          remaining--
          if (remaining !== 0 || settled) return
          try {
            const merged = mergeCanonicalBackupSnapshot(currentSnapshot, snapshot, { sourceExportedAt })
            for (const storeName of stores) {
              const store = tx.objectStore(storeName)
              for (const record of merged.addedRecordsByStore[storeName] || []) store.add(structuredClone(record))
            }
            tx.__kfeRestoreSummary = {
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
        resolve(tx.__kfeRestoreSummary || { added: 0, duplicates: 0, conflicts: 0, archivedConflicts: 0 })
      }
      tx.onerror = () => fail(tx.error || new Error('KFE restore transaction failed.'))
      tx.onabort = () => { if (!settled) { settled = true; reject(tx.error || new Error('KFE restore transaction aborted.')) } }
    })
  },

  async resetCanonicalData() {
    const db = await openCanonicalDB()
    // The settings store is configuration, not business activity. Compliance/EMI
    // defaults and other saved configuration must survive a business-data reset.
    // Unfinished form drafts are operational state and should be cleared.
    const resetStores = [...new Set([...stores.filter(storeName => storeName !== 'settings'), 'form_drafts'])]
    await new Promise((resolve, reject) => {
      const tx = db.transaction(resetStores, 'readwrite')
      try {
        for (const storeName of resetStores) tx.objectStore(storeName).clear()
      } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: resetStores, reason: 'data:reset' }); resolve() }
      tx.onerror = () => reject(tx.error || new Error('KFE data reset transaction failed.'))
      tx.onabort = () => reject(tx.error || new Error('KFE data reset transaction aborted.'))
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
})
