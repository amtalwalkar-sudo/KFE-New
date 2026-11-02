import { ShiftTripRepository } from '../../repositories/shiftTripRepository.js'
import { FuelRepository } from '../../repositories/fuelRepository.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { calculateFuelPeriodSummary } from '../../domain/math/fuel.js'
import { getKfeReferenceNow, istDateRange, reportingRangeFor } from '../../domain/time/ist.js'
import { EventLocationService } from '../location/eventLocationService.js'
import { LocalityRepository } from '../../repositories/localityRepository.js'
import { WorkService } from '../work/workService.js'

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
export const tripPeriodTime = trip => {
  if (trip?.status === 'COMPLETED') return validTime(trip.tripStartAt)
  if (trip?.status === 'CANCELLED') return validTime(trip.tripEndAt) ?? validTime(trip.tripStartAt) ?? validTime(trip.createdAt)
  return null
}
const recordTime = record => validTime(record?.capturedAt) ?? validTime(record?.createdAt)
const inRange = (time, range) => time != null && time >= range.from.getTime() && time <= range.to.getTime()
export const locationLabel = (snapshot, localityBySnapshotId = new Map()) => {
  const hasCoordinate = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
  if (!snapshot || !hasCoordinate(snapshot.latitude) || !hasCoordinate(snapshot.longitude)) return 'Location unavailable'
  const latitude = Number(snapshot.latitude)
  const longitude = Number(snapshot.longitude)
  const hasAccuracy = snapshot.accuracy !== null && snapshot.accuracy !== undefined && snapshot.accuracy !== ''
  const accuracy = hasAccuracy ? Number(snapshot.accuracy) : NaN
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    || (hasAccuracy && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 75))) return 'Location unavailable'
  // Never display a locality label unless the source fix has a recorded,
  // acceptable accuracy. Older labels created without accuracy are not trusted.
  const localityEligible = hasAccuracy && Number.isFinite(accuracy) && accuracy <= 75
  const savedRecord = localityEligible ? localityBySnapshotId.get(snapshot.id) : null
  const saved = savedRecord && savedRecord.eventAt === snapshot.eventAt && savedRecord.capturedAt === snapshot.capturedAt
    ? savedRecord.placeName : null
  if (typeof saved === 'string' && saved.trim()) return saved.trim()
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}
const durationMs = trip => {
  const start = validTime(trip?.tripStartAt)
  const end = validTime(trip?.tripEndAt)
  return start != null && end != null && end >= start ? end - start : null
}
const amount = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0
export const farePresentation = trip => {
  if (trip.status === 'CANCELLED') {
    const fee = trip.cancelledRevenue
    return { label: 'Cancellation fee', value: amount(fee) ? Number(fee) : null, state: amount(fee) ? 'recorded' : 'unavailable' }
  }
  if (trip.fareDetailsSkipped === true) return { label: 'Fare', value: null, state: 'skipped' }
  if (!amount(trip.revenue)) return { label: 'Fare', value: null, state: 'pending' }
  return { label: 'Fare', value: Number(trip.revenue), state: 'recorded' }
}

/**
 * Read-only Timeline projection over ride/fuel authorities and saved GPS snapshots.
 * Locality labels are read from permanent PWA IndexedDB records; this read model never performs network requests.
 */
export const ActivityTimelineReadService = Object.freeze({
  subscribeDataChanges(callback) {
    return subscribeCanonicalDataChanges(callback)
  },
  async getTimeline({ period = 'TODAY', startDate, endDate, now = getKfeReferenceNow() } = {}) {
    const hasCustomRange = startDate !== undefined || endDate !== undefined
    const reportingPeriod = PERIODS[period] || PERIODS.TODAY
    const range = hasCustomRange ? istDateRange(startDate, endDate) : reportingRangeFor(reportingPeriod, now)
    if (!range?.from || !range?.to || range.to < range.from) {
      throw new Error('Timeline date range could not be resolved.')
    }

    // Reconcile Android SQLite first so Timeline is correct even when it is
    // the first screen opened after a native overlay action or process restart.
    await WorkService.ensureCanonicalReadModel()
    const [allTrips, allFuelLogs] = await Promise.all([
      ShiftTripRepository.getAllTrips({ skipCanonicalReadBoundary: true }),
      FuelRepository.getAll(),
    ])
    const trips = (Array.isArray(allTrips) ? allTrips : []).filter(trip => !trip?.deletedAt && trip?.deleted !== true)
    const periodTrips = trips.filter(trip => (trip?.status === 'COMPLETED' || trip?.status === 'CANCELLED') && inRange(tripPeriodTime(trip), range))
    const tripLocations = await EventLocationService.forEntities('TRIP', periodTrips.map(trip => trip?.id), ['PICKUP_START', 'TRIP_END'])
    const localityRows = await LocalityRepository.forSnapshotIds(tripLocations.map(location => location.id))
    const localityBySnapshotId = new Map(localityRows.map(row => [row.snapshotId, row]))
    const locationsByTrip = new Map()
    for (const snapshot of tripLocations) {
      if (!snapshot?.entityId) continue
      const current = locationsByTrip.get(snapshot.entityId) || {}
      if (snapshot.eventType === 'PICKUP_START') current.pickup = snapshot
      if (snapshot.eventType === 'TRIP_END') current.end = snapshot
      if (snapshot.eventType === 'TRIP_CANCELLED') current.cancelled = snapshot
      locationsByTrip.set(snapshot.entityId, current)
    }

    const rides = periodTrips
      .map(trip => ({ trip, time: tripPeriodTime(trip) }))
      .map(({ trip, time }) => {
        const fare = farePresentation(trip)
        const locations = locationsByTrip.get(trip.id) || {}
        const pickupName = locationLabel(locations.pickup, localityBySnapshotId)
        const dropName = locationLabel(locations.end, localityBySnapshotId)
        return {
          id: trip.id,
          status: trip.status,
          statusLabel: trip.status === 'CANCELLED' ? 'Cancelled' : 'Completed',
          timeAt: new Date(time).toISOString(),
          timeLabel: trip.status === 'CANCELLED' ? 'Cancelled at' : 'Start time',
          durationMs: durationMs(trip),
          fareLabel: fare.label,
          fareValue: fare.value,
          fareState: fare.state,
          pickupArea: pickupName,
          // A cancelled trip's end GPS fix is a cancellation location, not a passenger drop-off.
          dropArea: trip.status === 'COMPLETED' ? dropName : 'Location unavailable',
        }
      })
      .sort((a, b) => Date.parse(b.timeAt) - Date.parse(a.timeAt))

    const fuelLogs = (Array.isArray(allFuelLogs) ? allFuelLogs : [])
      .filter(log => !log?.deletedAt && log?.deleted !== true)
      .filter(log => inRange(recordTime(log), range))
      .map(log => ({
        id: log.id,
        timeAt: new Date(recordTime(log)).toISOString(),
        amount: amount(log.amount) ? Number(log.amount) : null,
        quantityKg: log.quantityKg !== null && log.quantityKg !== undefined && log.quantityKg !== '' && Number.isFinite(Number(log.quantityKg)) && Number(log.quantityKg) > 0 ? Number(log.quantityKg) : null,
        odometer: log.odometer !== null && log.odometer !== undefined && log.odometer !== '' && Number.isFinite(Number(log.odometer)) && Number(log.odometer) >= 0 ? Number(log.odometer) : null,
        isFullTank: log.isFullTank === true,
      }))
      .sort((a, b) => Date.parse(b.timeAt) - Date.parse(a.timeAt))

    const fuelSummary = calculateFuelPeriodSummary(allFuelLogs, range)
    return {
      period: hasCustomRange ? 'CUSTOM' : period,
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      rides,
      fuelLogs,
      fuelSummary,
    }
  },
})

export { PERIODS as ACTIVITY_TIMELINE_PERIODS }
