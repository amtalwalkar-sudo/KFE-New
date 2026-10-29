import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
import { FuelRepository } from '../../repositories/fuelRepository.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { calculateFuelPeriodSummary } from '../../domain/math/fuel.js'
import { getKfeReferenceNow, reportingRangeFor } from '../../domain/time/ist.js'
import { EventLocationService } from '../location/eventLocationService.js'

const PERIODS = Object.freeze({
  TODAY: 'DAY',
  WEEK: 'WEEK',
  MONTH: 'MONTH',
})
const validTime = value => {
  if (value == null || value === '') return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}
const tripPeriodTime = trip => {
  if (trip?.status === 'COMPLETED') return validTime(trip.tripStartAt)
  if (trip?.status === 'CANCELLED') return validTime(trip.tripStartAt) ?? validTime(trip.createdAt)
  return null
}
const recordTime = record => validTime(record?.capturedAt) ?? validTime(record?.createdAt)
const inRange = (time, range) => time != null && time >= range.from.getTime() && time <= range.to.getTime()
const locationLabel = snapshot => {
  const latitude = Number(snapshot?.latitude)
  const longitude = Number(snapshot?.longitude)
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return 'Location unavailable'
  return `GPS ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}
const durationMs = trip => {
  const start = validTime(trip?.tripStartAt)
  const end = validTime(trip?.tripEndAt)
  return start != null && end != null && end >= start ? end - start : null
}
const amount = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
const farePresentation = trip => {
  if (trip.status === 'CANCELLED') {
    const fee = trip.cancelledRevenue ?? trip.revenue
    return { label: 'Cancellation fee', value: amount(fee) ? Number(fee) : null, state: amount(fee) ? 'recorded' : 'unavailable' }
  }
  if (trip.fareDetailsSkipped === true) return { label: 'Fare', value: null, state: 'skipped' }
  if (!amount(trip.revenue)) return { label: 'Fare', value: null, state: 'pending' }
  return { label: 'Fare', value: Number(trip.revenue), state: 'recorded' }
}

/**
 * Read-only Timeline projection over existing record authorities. No writes,
 * GPS capture, reverse geocoding, or separate business database are used here.
 */
export const ActivityTimelineReadService = Object.freeze({
  subscribeDataChanges(callback) {
    return subscribeCanonicalDataChanges(callback)
  },
  async getTimeline({ period = 'TODAY', now = getKfeReferenceNow() } = {}) {
    const reportingPeriod = PERIODS[period] || PERIODS.TODAY
    const range = reportingRangeFor(reportingPeriod, now)
    if (!range?.from || !range?.to || range.to < range.from) {
      throw new Error('Timeline reporting period could not be resolved.')
    }

    const [allTrips, allFuelLogs] = await Promise.all([
      ShiftTripRepository.getAllTrips(),
      FuelRepository.getAll(),
    ])
    const trips = Array.isArray(allTrips) ? allTrips : []
    const tripLocations = await EventLocationService.forEntities('TRIP', trips.map(trip => trip?.id))
    const locationsByTrip = new Map()
    for (const snapshot of tripLocations) {
      if (!snapshot?.entityId) continue
      const current = locationsByTrip.get(snapshot.entityId) || {}
      if (snapshot.eventType === 'PICKUP_START') current.pickup = snapshot
      if (snapshot.eventType === 'TRIP_END') current.end = snapshot
      if (snapshot.eventType === 'TRIP_CANCELLED') current.cancelled = snapshot
      locationsByTrip.set(snapshot.entityId, current)
    }

    const rides = trips
      .filter(trip => trip?.status === 'COMPLETED' || trip?.status === 'CANCELLED')
      .map(trip => ({ trip, time: tripPeriodTime(trip) }))
      .filter(item => inRange(item.time, range))
      .map(({ trip, time }) => {
        const fare = farePresentation(trip)
        const locations = locationsByTrip.get(trip.id) || {}
        const pickupName = locationLabel(locations.pickup)
        const dropName = locationLabel(locations.end)
        return {
          id: trip.id,
          status: trip.status,
          statusLabel: trip.status === 'CANCELLED' ? 'Cancelled' : 'Completed',
          timeAt: new Date(time).toISOString(),
          timeLabel: trip.status === 'CANCELLED' && validTime(trip.tripStartAt) == null ? 'Cancelled at' : 'Start time',
          durationMs: durationMs(trip),
          fareLabel: fare.label,
          fareValue: fare.value,
          fareState: fare.state,
          pickupArea: validTime(trip.tripStartAt) != null ? pickupName : 'Location unavailable',
                    // A cancelled trip's end GPS fix is a cancellation location, not a passenger drop-off.
          dropArea: trip.status === 'COMPLETED' ? dropName : 'Location unavailable',
        }
      })
      .sort((a, b) => Date.parse(b.timeAt) - Date.parse(a.timeAt))

    const fuelLogs = (Array.isArray(allFuelLogs) ? allFuelLogs : [])
      .filter(log => inRange(recordTime(log), range))
      .map(log => ({
        id: log.id,
        timeAt: new Date(recordTime(log)).toISOString(),
        amount: amount(log.amount) ? Number(log.amount) : null,
        quantityKg: Number.isFinite(Number(log.quantityKg)) && Number(log.quantityKg) > 0 ? Number(log.quantityKg) : null,
        odometer: Number.isFinite(Number(log.odometer)) && Number(log.odometer) >= 0 ? Number(log.odometer) : null,
        isFullTank: log.isFullTank === true,
      }))
      .sort((a, b) => Date.parse(b.timeAt) - Date.parse(a.timeAt))

    const fuelSummary = calculateFuelPeriodSummary(allFuelLogs, range)
    return {
      period,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      rides,
      fuelLogs,
      fuelSummary,
    }
  },
})

export { PERIODS as ACTIVITY_TIMELINE_PERIODS }
