import { Capacitor, registerPlugin } from '@capacitor/core'

const KfeOverlay = registerPlugin('KfeOverlay')

const isAndroid = () => Capacitor.getPlatform() === 'android'

export const AndroidOverlay = Object.freeze({
  async canDrawOverlays() {
    if (!isAndroid()) return { supported: false, granted: false }
    return KfeOverlay.canDrawOverlays()
  },
  async openPermissionSettings() {
    if (!isAndroid()) return
    return KfeOverlay.openPermissionSettings()
  },
  async prepare() {
    if (!isAndroid()) return
    return KfeOverlay.prepare()
  },
  async show(state = {}) {
    if (!isAndroid()) return
    return KfeOverlay.show({ state: JSON.stringify(state) })
  },
  async update(state = {}) {
    if (!isAndroid()) return
    return KfeOverlay.update({ state: JSON.stringify(state) })
  },
  async hide() {
    if (!isAndroid()) return
    return KfeOverlay.hide()
  }
})
