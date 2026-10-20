import { validateTripCorrection } from '../../domain/work/trip.js'
import { deriveLiveRevenue } from '../../domain/work/liveRevenue.js'

/**
 * Isolated POC: evaluate a fare submission using the existing shared domain
 * rules without touching UI, Capacitor, or persistence APIs.
 *
 * This is deliberately not wired into production. Persistence/idempotency must
 * be supplied by the canonical repository transaction in the next POC stage.
 */
export function evaluateHeadlessFareCommand({ command, trip, shiftTrips = [] } = {}) {
  if (!command || command.type !== 'FARE_SUBMITTED') {
    return { ok: false, reason: 'UNSUPPORTED_COMMAND' }
  }
  if (typeof command.operationId !== 'string' || !command.operationId.trim()) {
    return { ok: false, reason: 'OPERATION_ID_REQUIRED' }
  }
  if (!command.tripId || !trip || trip.id !== command.tripId) {
    return { ok: false, reason: 'TRIP_NOT_FOUND' }
  }
  if (trip.status !== 'COMPLETED') {
    return { ok: false, reason: 'TRIP_NOT_COMPLETED' }
  }
  if (typeof command.fareDetailsSkipped !== 'boolean') {
    return { ok: false, reason: 'FARE_SKIP_STATE_REQUIRED' }
  }

  const validated = validateTripCorrection({
    revenue: command.fare,
    fareDetailsSkipped: command.fareDetailsSkipped,
  })
  if (!validated.valid) return { ok: false, reason: validated.reason }

  const nextTrip = {
    ...trip,
    revenue: validated.revenue,
    fareDetailsSkipped: validated.fareDetailsSkipped,
    ...(command.at ? { updatedAt: command.at } : {}),
  }
  const nextTrips = shiftTrips.map(item => item.id === trip.id ? nextTrip : item)
  if (!nextTrips.some(item => item.id === trip.id)) nextTrips.push(nextTrip)

  return {
    ok: true,
    operationId: command.operationId,
    trip: nextTrip,
    shiftRevenue: deriveLiveRevenue(nextTrips),
  }
}
