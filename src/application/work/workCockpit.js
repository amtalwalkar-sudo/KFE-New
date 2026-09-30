export const WORK_COCKPIT_STATES = Object.freeze({
  OFFLINE: 'OFFLINE',
  READY: 'READY',
  GOING_TO_PICKUP: 'GOING_TO_PICKUP',
  READY_FOR_TRIP: 'READY_FOR_TRIP',
  RIDE_STARTED: 'RIDE_STARTED',
  ENTER_FARE: 'ENTER_FARE',
  END_SHIFT: 'END_SHIFT'
})

export const deriveWorkCockpitState = ({
  shift,
  trip,
  trips = [],
  pendingFareId = '',
  notificationPhase = '',
  target = '—',
  targetProgress = 0,
  liveKm = '0.0 km',
  revenue = '₹0'
} = {}) => {
  if (!shift?.id || shift.status !== 'ACTIVE') {
    return {
      state: WORK_COCKPIT_STATES.OFFLINE,
      action: 'GO_TO_PICKUP',
      tripId: '',
      tripStartAt: 0,
      target,
      targetProgress: Number(targetProgress) || 0,
      liveKm,
      revenue,
      pendingFare: false
    }
  }

  const pendingFareTrip = pendingFareId
    ? trips.find(item => item?.id === pendingFareId)
    : trips.find(item => item?.status === 'COMPLETED' && (item?.revenue === '' || item?.revenue === null || item?.revenue === undefined))

  if (pendingFareTrip?.id || notificationPhase === 'ENTER_FARE') {
    return {
      state: WORK_COCKPIT_STATES.ENTER_FARE,
      action: 'ENTER_FARE',
      tripId: pendingFareTrip?.id || trip?.id || '',
      tripStartAt: 0,
      target,
      targetProgress: Number(targetProgress) || 0,
      liveKm,
      revenue,
      pendingFare: true
    }
  }

  if (!trip?.id || trip.status !== 'ACTIVE') {
    return {
      state: WORK_COCKPIT_STATES.READY,
      action: 'GO_TO_PICKUP',
      tripId: '',
      tripStartAt: 0,
      target,
      targetProgress: Number(targetProgress) || 0,
      liveKm,
      revenue,
      pendingFare: false
    }
  }

  if (trip.tripStage === 'RIDE_STARTED') {
    return {
      state: WORK_COCKPIT_STATES.RIDE_STARTED,
      action: 'END_RIDE',
      tripId: trip.id,
      tripStartAt: trip.tripStartAt ? Date.parse(trip.tripStartAt) : 0,
      target,
      targetProgress: Number(targetProgress) || 0,
      liveKm,
      revenue,
      pendingFare: false
    }
  }

  return {
    state: WORK_COCKPIT_STATES.READY_FOR_TRIP,
    action: 'START_RIDE',
    tripId: trip.id,
    tripStartAt: 0,
    target,
    targetProgress: Number(targetProgress) || 0,
    liveKm,
    revenue,
    pendingFare: false
  }
}
