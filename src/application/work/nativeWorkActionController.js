/**
 * Owns FIFO replay of the durable Android event journal and acknowledges only
 * confirmed Work commits. The native event ID is the sole replay identity.
 */
export const createNativeWorkActionController = ({ actions, handleAction, isVisible = () => true }) => {
  if (!actions || typeof actions.consumePendingActions !== 'function'
    || typeof actions.acknowledgeAction !== 'function'
    || typeof actions.recordActionFailure !== 'function'
    || typeof handleAction !== 'function') {
    throw new TypeError('Native Work action controller dependencies are incomplete.')
  }

  let replayRunning = false
  const inFlight = new Set()

  const process = async event => {
    const eventId = String(event?.eventId || '')
    if (eventId && inFlight.has(eventId)) return false
    if (eventId) inFlight.add(eventId)
    try {
      const saved = await handleAction(event)
      if (saved && eventId) {
        const acknowledged = await actions.acknowledgeAction(
          eventId, String(event?.stage || ''), String(event?.tripId || ''),
        )
        if (!acknowledged) {
          await actions.recordActionFailure(eventId, 'Work saved the action but native acknowledgement failed')
          return false
        }
      } else if (!saved && eventId) {
        await actions.recordActionFailure(eventId, 'Work did not confirm the action was saved')
      }
      return Boolean(saved)
    } catch (error) {
      if (eventId) await actions.recordActionFailure(eventId, error?.message || error)
      return false
    } finally {
      if (eventId) inFlight.delete(eventId)
    }
  }

  const replay = async () => {
    if (!isVisible() || replayRunning) return false
    replayRunning = true
    try {
      // Propagate queue-read failures. An unreadable SQLite journal is not empty.
      const pending = await actions.consumePendingActions()
      for (const event of pending) {
        if (!await process(event)) return false
      }

      // Only consult the pre-ledger compatibility slot after SQLite has been
      // read successfully and found empty.
      if (!pending.length && typeof actions.consumePendingAction === 'function') {
        const legacy = await actions.consumePendingAction()
        if (legacy) {
          if (!await handleAction(legacy)) return false
          if (typeof actions.clearPendingAction !== 'function' || !await actions.clearPendingAction()) return false
        }
      }
      return true
    } finally {
      replayRunning = false
    }
  }

  return Object.freeze({ process, replay })
}
