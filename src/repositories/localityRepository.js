import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'

const readOne = (store, snapshotId) => new Promise((resolve, reject) => {
  const request = store.get(snapshotId)
  request.onsuccess = () => resolve(request.result || null)
  request.onerror = () => reject(request.error || new Error('Locality record lookup failed.'))
})

/** Permanent PWA-owned locality labels, keyed by the canonical GPS snapshot ID. */
export const LocalityRepository = Object.freeze({
  async getBySnapshotId(snapshotId) {
    if (!snapshotId) return null
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const request = db.transaction('locality_labels', 'readonly').objectStore('locality_labels').get(snapshotId)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error || new Error('Locality record lookup failed.'))
    })
  },
  async forSnapshotIds(snapshotIds = []) {
    const ids = [...new Set((snapshotIds || []).filter(value => typeof value === 'string' && value))]
    if (!ids.length) return []
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('locality_labels', 'readonly')
      const store = tx.objectStore('locality_labels')
      Promise.all(ids.map(id => readOne(store, id))).then(rows => resolve(rows.filter(Boolean))).catch(reject)
    })
  },
  async saveResolved({ snapshotId, placeName, provider, resolvedAt = new Date().toISOString(), eventAt = null, capturedAt = null } = {}) {
    if (typeof snapshotId !== 'string' || !snapshotId.trim() || typeof placeName !== 'string' || !placeName.trim()) {
      throw new TypeError('A GPS snapshot ID and verified locality name are required.')
    }
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('locality_labels', 'readwrite')
      const store = tx.objectStore('locality_labels')
      const request = store.get(snapshotId)
      let saved = null
      request.onsuccess = () => {
        // Successful labels are immutable during normal operation; provider retries
        // must never silently replace a previously verified locality.
        if (request.result) { saved = request.result; return }
        saved = { id: snapshotId, snapshotId, placeName: placeName.trim(), provider: provider || null, resolvedAt, eventAt, capturedAt }
        store.add(saved)
      }
      request.onerror = () => { try { tx.abort() } catch (_) {} }
      tx.oncomplete = () => {
        if (!request.result) notifyCanonicalDataChanged({ stores: ['locality_labels'], reason: 'gps-locality-resolved' })
        resolve(saved)
      }
      tx.onerror = () => reject(tx.error || new Error('Locality record could not be saved.'))
      tx.onabort = () => reject(tx.error || request.error || new Error('Locality record save was aborted.'))
    })
  },
})
