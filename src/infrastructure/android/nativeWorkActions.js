import { Capacitor, NativePlugins } from '../capacitor/nativePluginRegistry.js'

const NativeWorkActions = NativePlugins.workActions
const native = () => Capacitor?.isNativePlatform?.() === true

export const NativeWorkActionsService = Object.freeze({
  async clearPendingAction() {
    if (!native()) return false
    await NativeWorkActions.clearPendingAction()
    return true
  },
  async consumePendingActions() {
    if (!native()) return []
    // A failed SQLite read is not an empty queue. Propagate it so startup and
    // foreground recovery cannot proceed as though all native actions were handled.
    const result = await NativeWorkActions.getPendingActions()
    if (!Array.isArray(result?.events)) throw new Error('Native pending-action queue returned an invalid response.')
    return result.events
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
    // This is read-only compatibility for a pre-SQLite-ledger event. Do not
    // convert plugin failures into "no legacy event" during recovery.
    const result = await NativeWorkActions.getPendingAction()
    const packed = String(result?.pending || '')
    if (!packed) return null
    const [stage = '', tripId = '', input = ''] = packed.split('|')
    return { stage, tripId, input }
  },
  addListener(event, handler) {
    if (!native()) return Promise.resolve({ remove: async () => {} })
    return NativeWorkActions.addListener(event, handler)
  }
})
