export const TRIP_STATES = Object.freeze({ ACTIVE: 'ACTIVE', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' })

const TERMINAL_STATES = new Set([TRIP_STATES.COMPLETED, TRIP_STATES.CANCELLED])

export const canTransitionTrip = (from, to) => {
  if (from === TRIP_STATES.ACTIVE && TERMINAL_STATES.has(to)) return true
  return from === to && TERMINAL_STATES.has(to)
}

export const transitionTrip = (trip, to, data = {}) => {
  if (!trip || !trip.id) throw new Error('Trip is required.')
  if (!canTransitionTrip(trip.status, to)) throw new Error(`Trip cannot transition from ${trip.status} to ${to}.`)
  const next = { ...trip, status: to }
  if (data.tripEndAt) next.tripEndAt = data.tripEndAt
  if (data.tripEndLocation) next.tripEndLocation = data.tripEndLocation
  if (to === TRIP_STATES.COMPLETED && data.tripKm !== undefined && Number.isFinite(Number(data.tripKm)) && Number(data.tripKm) >= 0) {
    next.tripKm = Number(data.tripKm)
    next.tripKmAuthority = data.tripKmAuthority || 'GPS_ESTIMATE'
    next.tripKmProvenance = data.tripKmProvenance || null
  }
  if (to === TRIP_STATES.CANCELLED) {
    const revenue = data.revenue === undefined || data.revenue === '' || data.revenue === null ? null : Number(data.revenue)
    if (revenue !== null && (!Number.isFinite(revenue) || revenue < 0)) throw new Error('Cancelled trip revenue must be a non-negative number.')
    next.cancelledRevenue = revenue
    next.cancelReason = data.reason || 'DRIVER_MISTAKE'
    next.revenue = revenue
    next.revenueAuthority = 'SUPPORTING_ONLY'
    if (data.revenueProvenance !== undefined) next.revenueProvenance = data.revenueProvenance
  }
  return next
}


export const TRIP_STAGES = Object.freeze({
  GOING_TO_PICKUP: 'GOING_TO_PICKUP',
  RIDE_STARTED: 'RIDE_STARTED',
})

const canonicalStage = stage => stage === 'PICKUP' ? TRIP_STAGES.GOING_TO_PICKUP : stage

export const canTransitionTripStage = (from, to) =>
  canonicalStage(from) === TRIP_STAGES.GOING_TO_PICKUP &&
  canonicalStage(to) === TRIP_STAGES.RIDE_STARTED

export const transitionTripStage = (trip, to, { at } = {}) => {
  if (!trip?.id || trip.status !== TRIP_STATES.ACTIVE) throw new Error('An active Trip is required for a stage transition.')
  if (!canTransitionTripStage(trip.tripStage, to)) throw new Error(`Trip stage cannot transition from ${trip.tripStage} to ${to}.`)
  const next = { ...trip, tripStage: TRIP_STAGES.RIDE_STARTED }
  if (!next.tripStartAt && at) next.tripStartAt = at
  return next
}
