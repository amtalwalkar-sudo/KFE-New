import { Capacitor, NativePlugins } from '../capacitor/nativePluginRegistry.js'

const NativeWorkActions = NativePlugins.workActions
const native = () => Capacitor?.isNativePlatform?.() === true

export const NativeWorkActionsService = Object.freeze({
  async clearPendingAction() {
    if (!native()) return false
    try { await NativeWorkActions.clearPendingAction(); return true } catch (_) { return false }
  },
  async consumePendingActions() {
    if (!native()) return []
    try {
      const result = await NativeWorkActions.getPendingActions()
      return Array.isArray(result?.events) ? result.events : []
    } catch (_) { return [] }
  },
  async acknowledgeAction(eventId, stage = '', tripId = '') {
    if (!native() || !eventId) return false
    try {
      const result = await NativeWorkActions.acknowledgeAction({ eventId, stage, tripId })
      return result?.acknowledged === true
    } catch (_) { return false }
  },
  async recordActionFailure(eventId, error) {
    if (!native() || !eventId) return false
    try {
      await NativeWorkActions.recordActionFailure({ eventId, error: String(error || 'Processing failed') })
      return true
    } catch (_) { return false }
  },
  async consumePendingAction() {
    if (!native()) return null
    try {
      const result = await NativeWorkActions.getPendingAction()
      const packed = String(result?.pending || '')
      if (!packed) return null
      const [stage = '', tripId = '', input = ''] = packed.split('|')
      return { stage, tripId, input }
    } catch (_) { return null }
  },
  addListener(event, handler) {
    if (!native()) return Promise.resolve({ remove: async () => {} })
    return NativeWorkActions.addListener(event, handler)
  }
})
