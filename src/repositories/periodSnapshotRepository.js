import { initializeCanonicalStorage } from '../utils/indexedDB.js'
import { assertPeriodSnapshot, verifyPeriodSnapshot } from '../domain/finance/periodSnapshot.js'

const STORE = 'financial_period_snapshots'

const readOne = async periodKey => {
  const db = await initializeCanonicalStorage({ dataSource: 'canonical' })
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(periodKey)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error('Financial period snapshot lookup failed.'))
  })
}

export const PeriodSnapshotRepository = Object.freeze({
  async get(periodKey) {
    const snapshot = await readOne(periodKey)
    if (!snapshot) return null
    await assertPeriodSnapshot(snapshot)
    return structuredClone(snapshot)
  },
  async list() {
    const db = await initializeCanonicalStorage({ dataSource: 'canonical' })
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      request.onsuccess = async () => {
        try {
          const verified = []
          for (const snapshot of request.result || []) {
            const result = await verifyPeriodSnapshot(snapshot)
            if (!result.valid) throw new Error(`Invalid financial period snapshot: ${result.reason}`)
            verified.push(structuredClone(snapshot))
          }
          resolve(verified.sort((a, b) => a.periodKey.localeCompare(b.periodKey)))
        } catch (error) { reject(error) }
      }
      request.onerror = () => reject(request.error || new Error('Financial period snapshot listing failed.'))
    })
  },
  async create(snapshot) {
    await assertPeriodSnapshot(snapshot)
    const db = await initializeCanonicalStorage({ dataSource: 'canonical' })
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const request = store.add(structuredClone(snapshot))
      request.onerror = () => {
        try { tx.abort() } catch (_) {}
        reject(request.error?.name === 'ConstraintError'
          ? new Error(`Financial period ${snapshot.periodKey} is already closed and immutable.`)
          : (request.error || new Error('Financial period snapshot creation failed.')))
      }
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error('Financial period snapshot transaction failed.'))
      tx.onabort = () => reject(tx.error || new Error('Financial period snapshot transaction aborted.'))
    })
  },
})
