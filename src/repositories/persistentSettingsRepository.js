import { initializeCanonicalStorage, getActiveDataSource, notifyCanonicalDataChanged } from '../utils/indexedDB.js'

const recordId = key => `persistent-setting:${key}`

export const PersistentSettingsRepository = Object.freeze({
  async get(key) {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const request = db.transaction('settings', 'readonly').objectStore('settings').get(recordId(key))
      request.onsuccess = () => resolve(request.result ? structuredClone(request.result.values || {}) : null)
      request.onerror = () => reject(request.error || new Error(`Failed to read persistent setting ${key}.`))
    })
  },

  async save(key, values) {
    const db = await initializeCanonicalStorage()
    const now = new Date().toISOString()
    const id = recordId(key)
    const previous = await new Promise((resolve, reject) => {
      const request = db.transaction('settings', 'readonly').objectStore('settings').get(id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error || new Error(`Failed to inspect persistent setting ${key}.`))
    })
    const record = {
      id,
      settingKey: key,
      values: structuredClone(values),
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite')
      tx.objectStore('settings').put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error(`Failed to save persistent setting ${key}.`))
      tx.onabort = () => reject(tx.error || new Error(`Saving persistent setting ${key} was aborted.`))
    })
    if (getActiveDataSource() === 'canonical') {
      notifyCanonicalDataChanged({ stores: ['settings'], reason: `settings:${key}:save` })
    }
    return structuredClone(record.values)
  },
})
