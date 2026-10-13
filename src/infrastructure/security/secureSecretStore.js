import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeSecureStorage = registerPlugin('KfeSecureStorage')
const WEB_DB_NAME = 'kfe_secure_secret_store'
const WEB_DB_VERSION = 1
const WEB_STORE = 'secrets'
const WEB_KEY_ID = 'kfe-web-secret-key-v1'
const nonBrowserTestSecrets = new Map()
const webCrypto = () => {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues || !globalThis.indexedDB) {
    throw new Error('Persistent encrypted secret storage is unavailable in this browser. Use the installed Android app or a supported secure browser.')
  }
  return globalThis.crypto
}

let databasePromise
let webKeyPromise
const openWebDatabase = () => {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(WEB_DB_NAME, WEB_DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WEB_STORE)) request.result.createObjectStore(WEB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { databasePromise = null; reject(request.error || new Error('Could not open secure secret storage.')) }
    request.onblocked = () => { databasePromise = null; reject(new Error('Secure secret storage upgrade is blocked by another open tab.')) }
  })
  return databasePromise
}

const readWebValue = async key => {
  const db = await openWebDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction(WEB_STORE, 'readonly').objectStore(WEB_STORE).get(key)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error || new Error('Could not read secure secret storage.'))
  })
}
const writeWebValue = async (key, value) => {
  const db = await openWebDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_STORE, 'readwrite')
    tx.objectStore(WEB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Could not write secure secret storage.'))
    tx.onabort = () => reject(tx.error || new Error('Secure secret storage write was aborted.'))
  })
}
const removeWebValue = async key => {
  const db = await openWebDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_STORE, 'readwrite')
    tx.objectStore(WEB_STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Could not remove secure secret storage.'))
    tx.onabort = () => reject(tx.error || new Error('Secure secret storage removal was aborted.'))
  })
}
const getWebKey = () => {
  if (!webKeyPromise) {
    webKeyPromise = (async () => {
      const cryptoApi = webCrypto()
      let key = await readWebValue(WEB_KEY_ID)
      if (key) return key
      key = await cryptoApi.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      await writeWebValue(WEB_KEY_ID, key)
      return key
    })().catch(error => { webKeyPromise = null; throw error })
  }
  return webKeyPromise
}
const getWebSecret = async key => {
  const record = await readWebValue(`secret:${key}`)
  if (!record) return ''
  if (record.version !== 1 || !(record.iv instanceof ArrayBuffer) || !(record.ciphertext instanceof ArrayBuffer)) {
    throw new Error('Stored web secret has an unsupported or damaged encrypted format.')
  }
  const cryptoApi = webCrypto()
  const plain = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.iv) }, await getWebKey(), record.ciphertext)
  return new TextDecoder().decode(plain)
}
const setWebSecret = async (key, value) => {
  const cryptoApi = webCrypto()
  const iv = cryptoApi.getRandomValues(new Uint8Array(12))
  const ciphertext = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, await getWebKey(), new TextEncoder().encode(value))
  await writeWebValue(`secret:${key}`, { version: 1, iv: iv.buffer, ciphertext })
}

export const SecureSecretStore = Object.freeze({
  async get(key) {
    if (Capacitor.isNativePlatform()) {
      const result = await NativeSecureStorage.get({ key })
      return result?.value || ''
    }
    if (typeof window === 'undefined') return nonBrowserTestSecrets.get(key) || ''
    return getWebSecret(key)
  },
  async set(key, value) {
    if (Capacitor.isNativePlatform()) {
      await NativeSecureStorage.set({ key, value })
      return
    }
    if (typeof window === 'undefined') {
      if (value) nonBrowserTestSecrets.set(key, String(value))
      else nonBrowserTestSecrets.delete(key)
      return
    }
    if (value) await setWebSecret(key, String(value))
    else await removeWebValue(`secret:${key}`)
  },
  async remove(key) {
    if (Capacitor.isNativePlatform()) {
      await NativeSecureStorage.remove({ key })
      return
    }
    if (typeof window === 'undefined') { nonBrowserTestSecrets.delete(key); return }
    await removeWebValue(`secret:${key}`)
  },
})
