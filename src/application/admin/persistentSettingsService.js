import { PersistentSettingsRepository } from '../../repositories/persistentSettingsRepository.js'

export const PERSISTENT_SETTING_KEYS = Object.freeze({
  complianceDefaults: 'complianceDefaults',
  emiDefaults: 'emiDefaults',
})

const supportedKeys = new Set(Object.values(PERSISTENT_SETTING_KEYS))
const assertSupportedKey = key => {
  if (!supportedKeys.has(key)) throw new Error(`Unsupported persistent setting: ${key}`)
}

export const PersistentSettingsService = Object.freeze({
  async get(key) {
    assertSupportedKey(key)
    return PersistentSettingsRepository.get(key)
  },

  async save(key, values) {
    assertSupportedKey(key)
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new TypeError('Persistent setting values must be an object.')
    }
    return PersistentSettingsRepository.save(key, values)
  },
})
