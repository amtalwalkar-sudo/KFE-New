import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeSecureStorage = registerPlugin('KfeSecureStorage')
const memory = new Map()

export const SecureSecretStore = Object.freeze({
  async get(key) {
    if (Capacitor.isNativePlatform()) {
      const result = await NativeSecureStorage.get({ key })
      return result?.value || ''
    }
    return memory.get(key) || ''
  },
  async set(key, value) {
    if (Capacitor.isNativePlatform()) {
      await NativeSecureStorage.set({ key, value })
      return
    }
    if (value) memory.set(key, value)
    else memory.delete(key)
  },
  async remove(key) {
    if (Capacitor.isNativePlatform()) {
      await NativeSecureStorage.remove({ key })
      return
    }
    memory.delete(key)
  },
})
