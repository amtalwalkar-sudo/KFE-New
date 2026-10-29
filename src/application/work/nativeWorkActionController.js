/**
 * Serializes durable Android overlay actions and acknowledges only confirmed
 * Work commits. Event IDs remain the sole replay/idempotency identity.
 */
export const createNativeWorkActionController = ({ actions, handleAction, isVisible = () => true }) => {
  if (!actions || typeof actions.consumePendingActions !== 'function'
    || typeof actions.acknowledgeAction !== 'function'
    || typeof actions.recordActionFailure !== 'function'
    || typeof handleAction !== 'function') {
    throw new TypeError('Native Work action controller dependencies are incomplete.')
  }

  let queue = Promise.resolve()
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

  const enqueue = event => {
    const next = queue.then(() => process(event))
    queue = next.catch(() => {})
    return next
  }

  const replay = async () => {
    if (!isVisible() || replayRunning) return
    replayRunning = true
    try {
      const pending = await actions.consumePendingActions()
      for (const event of pending) await enqueue(event)
    } finally {
      replayRunning = false
    }
  }

  return Object.freeze({ process, enqueue, replay })
}
