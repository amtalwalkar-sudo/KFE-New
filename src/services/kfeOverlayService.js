import { Capacitor, registerPlugin } from '@capacitor/core'

const KfeOverlay = registerPlugin('KfeOverlay')
const native = () => Capacitor?.isNativePlatform?.() === true

const call = async (method, options = {}) => {
  if (!native()) return false
  try {
    await KfeOverlay[method](options)
    return true
  } catch (_) {
    return false
  }
}

export const KfeOverlayService = Object.freeze({
  async status() {
    if (!native()) return { supported: false, granted: false }
    try { return await KfeOverlay.status() } catch (_) { return { supported: false, granted: false } }
  },
  async openPermissionSettings() {
    return call('openPermissionSettings')
  },
  async show(state = {}) {
    return call('show', state)
  },
  async update(state = {}) {
    return call('update', state)
  },
  async hide() {
    return call('hide')
  }
})
