import { registerPlugin, Capacitor } from '@capacitor/core'

const REGION_ID = 'mumbai-pune-nashik-alibag-v1'
const isAndroidNative = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
let pluginPromise

async function plugin() {
  if (!isAndroidNative()) return null
  if (!pluginPromise) pluginPromise = Promise.resolve(registerPlugin('KfeOfflineMaps'))
  return pluginPromise
}

export const OfflineMapService = {
  regionId: REGION_ID,
  async status() {
    const native = await plugin()
    if (!native) return { supported: false, installed: false, regionId: REGION_ID, version: '', bytesInstalled: 0, bytesAvailable: null }
    return native.getStatus()
  },
  async downloadUpdate() {
    const native = await plugin()
    if (!native) throw new Error('Offline Valhalla downloads require the KFE Android app.')
    return native.downloadUpdate({ confirmed: true })
  },
  async addListener(eventName, listener) {
    const native = await plugin()
    if (!native) return { remove: async () => {} }
    return native.addListener(eventName, listener)
  },
  async traceRoute(points) {
    const native = await plugin()
    if (!native) return null
    const status = await native.getStatus()
    if (!status.installed) return null
    const result = await native.traceRoute({ points })
    const raw = typeof result?.raw === 'string' ? JSON.parse(result.raw) : result?.raw
    if (!raw) return null
    return { raw, provider: 'valhalla-mobile', regionId: REGION_ID }
  }
}
