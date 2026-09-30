export const WORK_COCKPIT_STATES = Object.freeze({
  OFFLINE: 'OFFLINE',
  READY: 'READY',
  GOING_TO_PICKUP: 'GOING_TO_PICKUP',
  READY_FOR_TRIP: 'READY_FOR_TRIP',
  TRIP_ACTIVE: 'TRIP_ACTIVE',
  ENTER_FARE: 'ENTER_FARE',
  END_SHIFT: 'END_SHIFT'
})

export const deriveWorkCockpitState = ({
  shift, trip, trips = [], pendingFareId = '', notificationPhase = '',
  target = '—', targetProgress = 0, liveKm = '0.0 km', revenue = '₹0'
} = {}) => {
  const base = { target, targetProgress: Number(targetProgress) || 0, liveKm, revenue }
  const shiftStartAt = Date.parse(shift?.shiftStartAt || '') || 0
  const shiftEndAt = Date.parse(shift?.shiftEndAt || '') || 0
  const shiftDurationMs = shiftStartAt ? Math.max(0, (shiftEndAt || Date.now()) - shiftStartAt) : 0
  if (!shift?.id || shift.status !== 'ACTIVE') return { ...base, state: WORK_COCKPIT_STATES.OFFLINE, action: 'GO_TO_PICKUP', tripId: '', tripStartAt: 0, shiftStartAt, pendingFare: false, shiftDurationMs }
  const pendingFareTrip = pendingFareId ? trips.find(item => item?.id === pendingFareId) : trips.find(item => item?.status === 'COMPLETED' && (item?.revenue === '' || item?.revenue == null))
  if (pendingFareTrip?.id || notificationPhase === 'ENTER_FARE') return { ...base, state: WORK_COCKPIT_STATES.ENTER_FARE, action: 'ENTER_FARE', tripId: pendingFareTrip?.id || trip?.id || '', tripStartAt: 0, shiftStartAt, pendingFare: true }
  if (!trip?.id || trip.status !== 'ACTIVE') return { ...base, state: WORK_COCKPIT_STATES.READY, action: 'GO_TO_PICKUP', tripId: '', tripStartAt: 0, shiftStartAt, pendingFare: false }
  if (trip.tripStage === 'RIDE_STARTED') return { ...base, state: WORK_COCKPIT_STATES.TRIP_ACTIVE, action: 'END_RIDE', tripId: trip.id, tripStartAt: Date.parse(trip.tripStartAt || '') || 0, shiftStartAt, pendingFare: false }
  if (trip.tripStage === 'GOING_TO_PICKUP') return { ...base, state: WORK_COCKPIT_STATES.GOING_TO_PICKUP, action: 'START_RIDE', tripId: trip.id, tripStartAt: 0, shiftStartAt, pendingFare: false }
  return { ...base, state: WORK_COCKPIT_STATES.READY_FOR_TRIP, action: 'START_RIDE', tripId: trip.id, tripStartAt: 0, shiftStartAt, pendingFare: false }
}