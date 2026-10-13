export const getLiveMovementTracePlan = ({ shiftId, trip } = {}) => {
  const activeTrip = trip?.status === 'ACTIVE' && Boolean(trip?.id)
  const passengerRide = activeTrip && trip?.tripStage === 'RIDE_STARTED'
  const entityType = activeTrip ? 'TRIP' : 'SHIFT'
  const entityId = activeTrip ? trip.id : shiftId
  const eventType = passengerRide ? 'PASSENGER_RIDE_TRACE' : 'DEAD_MOVEMENT_TRACE'
  return {
    entityType,
    entityId,
    eventType,
    profile: passengerRide ? 'PASSENGER_RIDE' : 'DEAD_LEG'
  }
}

export const matchesLiveMovementSession = (session, plan) => Boolean(
  session && plan &&
  session.entityType === plan.entityType &&
  session.entityId === plan.entityId &&
  session.eventType === plan.eventType &&
  session.profile === plan.profile
)
