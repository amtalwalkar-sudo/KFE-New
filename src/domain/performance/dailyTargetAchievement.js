const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const dateOf = value => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}
const amount = value => Number.isFinite(Number(value)) ? Number(value) : null
const inRange = (value, range) => {
  const date = dateOf(value)
  return !!date && !!range?.from && !!range?.to && date >= range.from && date <= range.to
}

/**
 * Driver target progress has a deliberate live-shift rule separate from financial
 * reporting authority:
 * - completed shifts contribute their persisted trip-derived Shift revenue;
 * - during an active shift, eligible completed fares and recorded cancellation fees
 *   contribute when their terminal event falls inside the target day;
 * - skipped/missing trip fares contribute zero. Cancellation fees default to zero when blank.
 * Active-trip contributions never get added again to a completed shift's projection.
 */
export const deriveDailyTargetAchievement = ({
  shifts = [],
  trips = [],
  range,
  asOf = new Date(),
  completedShiftRevenue = 0,
}) => {
  const now = dateOf(asOf)
  if (!now) return Math.max(0, amount(completedShiftRevenue) ?? 0)

  const activeShiftIds = new Set(live(shifts)
    .filter(shift => shift?.status === 'ACTIVE' && !shift?.shiftEndAt)
    .filter(shift => {
      const started = dateOf(shift.shiftStartAt)
      return !!started && started <= now && started <= (dateOf(range?.to) || now)
    })
    .map(shift => shift.id)
    .filter(Boolean))

  const liveTripRevenue = live(trips)
    .filter(trip => activeShiftIds.has(trip.shiftId))
    .filter(trip => trip?.status === 'CANCELLED' || (trip?.status === 'COMPLETED' && trip?.fareDetailsSkipped !== true))
    .filter(trip => inRange(trip.status === 'CANCELLED' ? (trip.cancelledAt || trip.updatedAt || trip.tripEndAt) : trip.tripEndAt, range))
    .filter(trip => {
      const ended = dateOf(trip.status === 'CANCELLED' ? (trip.cancelledAt || trip.updatedAt || trip.tripEndAt) : trip.tripEndAt)
      return !!ended && ended <= now
    })
    .reduce((total, trip) => {
      const recordedAmount = trip.status === 'CANCELLED'
        ? amount(trip.cancelledRevenue ?? trip.revenue)
        : amount(trip.revenue)
      return recordedAmount !== null && recordedAmount >= 0 ? total + recordedAmount : total
    }, 0)

  const finalizedShiftRevenue = amount(completedShiftRevenue)
  return Math.max(0, (finalizedShiftRevenue ?? 0) + liveEnteredTripRevenue)
}
