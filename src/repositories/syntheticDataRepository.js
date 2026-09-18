import { initializeSyntheticStorage, setActiveDataSource, SYNTHETIC_DB_NAME } from '../utils/indexedDB.js'

const SYNTHETIC_STORES = Object.freeze(['shifts','fuel_logs','odoGaps','pending_mutations','days','trips','gps_snapshots','movement_artifacts','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settings','audit_history'])

export const SyntheticDataRepository = Object.freeze({
  async writeSnapshot(snapshot) {
    const db = await initializeSyntheticStorage()
    const stores = Object.keys(snapshot)
    await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite')
      try {
        for (const storeName of stores) {
          const store = tx.objectStore(storeName)
          store.clear()
          for (const record of snapshot[storeName]) store.put(structuredClone(record))
        }
      } catch (error) { try { tx.abort() } catch (_) {}; reject(error); return }
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error || new Error('Synthetic dataset write failed.'))
      tx.onabort = () => reject(tx.error || new Error('Synthetic dataset write aborted.'))
    })
  },
  async getStatus() {
    const db = await initializeSyntheticStorage()
    return new Promise((resolve, reject) => {
      const request = db.transaction('settings', 'readonly').objectStore('settings').get('synthetic-setting-manifest')
      request.onsuccess = () => resolve(request.result?.values || null)
      request.onerror = () => reject(request.error || new Error('Synthetic dataset status lookup failed.'))
    })
  },
  async clear() {
    const db = await initializeSyntheticStorage()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SYNTHETIC_STORES, 'readwrite')
      SYNTHETIC_STORES.forEach(name => tx.objectStore(name).clear())
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error || new Error('Synthetic data clear failed.'))
      tx.onabort = () => reject(tx.error || new Error('Synthetic data clear aborted.'))
    })
    setActiveDataSource('canonical')
  },
  activate() { setActiveDataSource('synthetic') },
  databaseName: SYNTHETIC_DB_NAME,
})
