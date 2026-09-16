import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'

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

export const createBackupRepository = stores => Object.freeze({
  async readCanonicalSnapshot() {
    const db = await initializeCanonicalStorage()
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

  async restoreCanonicalSnapshot(snapshot) {
    const db = await initializeCanonicalStorage()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite')
      try {
        for (const storeName of stores) {
          const store = tx.objectStore(storeName)
          store.clear()
          for (const record of snapshot[storeName] || []) store.add(structuredClone(record))
        }
      } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores, reason: 'backup:restore' }); resolve() }
      tx.onerror = () => reject(tx.error || new Error('KFE restore transaction failed.'))
      tx.onabort = () => reject(tx.error || new Error('KFE restore transaction aborted.'))
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
