import { initializeCanonicalStorage, getActiveDataSource, notifyCanonicalDataChanged } from '../../utils/indexedDB.js'

export const PERSISTENT_SETTING_KEYS = Object.freeze({
  complianceDefaults: 'complianceDefaults',
  emiDefaults: 'emiDefaults',
})

const supportedKeys = new Set(Object.values(PERSISTENT_SETTING_KEYS))
const recordId = key => `persistent-setting:${key}`

function assertSupportedKey(key) {
  if (!supportedKeys.has(key)) throw new Error(`Unsupported persistent setting: ${key}`)
}

export const PersistentSettingsService = Object.freeze({
  async get(key) {
    assertSupportedKey(key)
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const request = db.transaction('settings', 'readonly').objectStore('settings').get(recordId(key))
      request.onsuccess = () => resolve(request.result ? structuredClone(request.result.values || {}) : null)
      request.onerror = () => reject(request.error || new Error(`Failed to read persistent setting ${key}.`))
    })
  },

  async save(key, values) {
    assertSupportedKey(key)
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new TypeError('Persistent setting values must be an object.')
    }
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
