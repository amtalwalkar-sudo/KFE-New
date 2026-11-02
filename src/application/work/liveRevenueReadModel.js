import { deriveLiveRevenue } from '../../domain/work/liveRevenue.js'

/** Application read model for the single canonical Shift revenue rule. */
export const LiveRevenueReadModel = Object.freeze({
  forShift(trips = [], shiftId = '') {
    if (!shiftId) return 0
    return deriveLiveRevenue((Array.isArray(trips) ? trips : []).filter(trip => trip?.shiftId === shiftId))
  },
  forTrips(trips = []) {
    return deriveLiveRevenue(trips)
  },
})
