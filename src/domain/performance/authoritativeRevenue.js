import { istMonthKey } from '../time/ist.js'

const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const dateOf = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null }
const inRange = (value, range) => { const date = dateOf(value); return !!date && date >= range.from && date <= range.to }
const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0

/** Shift-end revenue is the authoritative operational revenue record. Trip revenue is optional detail only. */
export const authoritativeShiftRevenue = (shifts, range) => live(shifts)
  .filter(shift => inRange(shift.shiftEndAt || shift.shiftStartAt, range))
  .reduce((total, shift) => total + amount(shift.revenue), 0)

/**
 * Returns authoritative shift-end revenue by IST month.
 * When asOf is supplied, the current/historical view is bounded by that
 * timestamp so future shifts cannot change a reconstructed target or report.
 */
export const authoritativeShiftRevenueByMonth = (shifts, asOf = null) => {
  const boundary = dateOf(asOf)
  const result = new Map()
  for (const shift of live(shifts)) {
    const date = dateOf(shift.shiftEndAt || shift.shiftStartAt)
    if (!date || (boundary && date > boundary)) continue
    const month = istMonthKey(date)
    result.set(month, (result.get(month) || 0) + amount(shift.revenue))
  }
  return result
}
