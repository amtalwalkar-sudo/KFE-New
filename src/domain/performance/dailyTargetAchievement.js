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
 * - completed shifts contribute only their authoritative shift-end revenue;
 * - during an active shift, a completed trip contributes only when its fare was
 *   explicitly saved (not skipped) and its completion falls inside the target day;
 * - skipped/missing trip fares contribute nothing until shift close, when the
 *   driver's per-trip corrections or single shift total are persisted as Shift.revenue.
 * Trip fares never replace or get added to a completed shift's authoritative total.
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

  const liveEnteredTripRevenue = live(trips)
    .filter(trip => trip?.status === 'COMPLETED' && activeShiftIds.has(trip.shiftId))
    .filter(trip => trip?.fareDetailsSkipped !== true && trip?.revenue !== null && trip?.revenue !== undefined && trip?.revenue !== '')
    .filter(trip => inRange(trip.tripEndAt, range))
    .filter(trip => {
      const ended = dateOf(trip.tripEndAt)
      return !!ended && ended <= now
    })
    .reduce((total, trip) => {
      const fare = amount(trip.revenue)
      return fare !== null && fare >= 0 ? total + fare : total
    }, 0)

  const finalizedShiftRevenue = amount(completedShiftRevenue)
  return Math.max(0, (finalizedShiftRevenue ?? 0) + liveEnteredTripRevenue)
}
