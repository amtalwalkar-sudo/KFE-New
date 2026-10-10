import { istDateKey } from '../time/ist.js'

const finite = v => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
const dateOf = v => { const x = v ? new Date(v) : null; return x && !Number.isNaN(x.getTime()) ? x : null }
const keyOf = v => istDateKey(v)
const live = xs => (xs || []).filter(x => !x?.deletedAt && x?.deleted !== true)
const effectiveFrom = x => dateOf(x?.effectiveFrom || x?.validFrom || x?.startDate)
const effectiveUntil = x => dateOf(x?.effectiveUntil || x?.validUntil || x?.endDate)
const applies = (x, day) => {
  const from = effectiveFrom(x) || new Date(0)
  const until = effectiveUntil(x) || new Date('9999-12-31T23:59:59.999Z')
  return x?.active !== false && x?.status !== 'INACTIVE' && from <= day && day <= until
}
const latestForDay = (xs, day) => live(xs).filter(x => applies(x, day)).sort((a, b) => String(b.effectiveFrom || b.startDate || '').localeCompare(String(a.effectiveFrom || a.startDate || '')) || String(b.updatedAt || b.createdAt || b.id || '').localeCompare(String(a.updatedAt || a.createdAt || a.id || '')))[0] || null
const calendarDays = (from, to) => {
  const a = keyOf(from), b = keyOf(to)
  if (!a || !b || b < a) return null
  const ordinal = key => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000 }
  return ordinal(b) - ordinal(a) + 1
}
const nonWorkingDateKeys = record => {
  const raw = record?.nonWorkingDates
  const values = Array.isArray(raw) ? raw : String(raw || '').split(/[,\n]/)
  return new Set(values.map(value => keyOf(String(value).trim())).filter(Boolean))
}
const calendarDaysInMonthFor = day => {
  const key = keyOf(day)
  if (!key) return null
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}
const periodBaseTarget = (record, applicableBreakEven = null) => {
  const desiredDriverProfit = finite(record?.desiredDriverProfit)
  if (desiredDriverProfit != null && applicableBreakEven != null) return applicableBreakEven + desiredDriverProfit
  return finite(record?.targetRevenue)
}
const baseDailyFor = (record, applicableBreakEven = null, day = null) => {
  const periodTarget = periodBaseTarget(record, applicableBreakEven)
  const daysInMonth = calendarDaysInMonthFor(day || effectiveFrom(record))
  // A configured monthly target (monthly desired profit + authoritative break-even,
  // or a target with an explicit validity window) uses calendar-month days. Legacy
  // targetRevenue records without an end date remain daily targets for compatibility.
  const isMonthlyTarget = (finite(record?.desiredDriverProfit) != null && applicableBreakEven != null) || !!effectiveUntil(record)
  const denominator = isMonthlyTarget ? daysInMonth : 1
  return periodTarget == null || denominator == null || denominator <= 0 ? null : periodTarget / denominator
}

export function deriveRollingDriverTarget({ trips = [], shifts = [], driverTargets = [], from, to, applicableBreakEven = null } = {}) {
  const start = dateOf(from), end = dateOf(to)
  if (!start || !end || end < start) return { available: false, reason: 'INVALID_PERIOD', balanceBefore: null, currentDailyTarget: null, periodBaseTarget: null }
  // Shift.revenue is the authoritative finalized revenue source. Trip fares are
  // supporting detail and must never be substituted for the shift total.
  const byDay = new Map()
  for (const shift of live(shifts)) {
    if (!shift?.shiftEndAt && String(shift?.status || '').toUpperCase() !== 'COMPLETED') continue
    const day = keyOf(shift.shiftEndAt || shift.shiftStartAt)
    const revenue = finite(shift.revenue)
    if (!day || revenue == null || revenue < 0) continue
    byDay.set(day, (byDay.get(day) || 0) + revenue)
  }
  const activeDaySet = new Set()
  for (const shift of live(shifts)) {
    const day = keyOf(shift.shiftEndAt || shift.shiftStartAt)
    if (!day) continue
    const target = latestForDay(driverTargets, dateOf(day))
    if (target && nonWorkingDateKeys(target).has(day)) continue
    activeDaySet.add(day)
  }
  const allActiveDays = [...activeDaySet].sort()
  let balance = 0
  for (const dayKey of allActiveDays) {
    const day = dateOf(dayKey)
    if (!day || day >= start) break
    const record = latestForDay(driverTargets, day)
    if (!record) continue
    const sameTargetMonth = keyOf(day) === keyOf(start) || keyOf(day)?.slice(0, 7) === keyOf(start)?.slice(0, 7)
    const priorMonthBreakEven = sameTargetMonth ? applicableBreakEven : null
    const baseDaily = baseDailyFor(record, priorMonthBreakEven, day)
    if (baseDaily == null) continue
    if (byDay.has(dayKey)) balance += baseDaily - byDay.get(dayKey)
  }
  const currentDays = allActiveDays.filter(k => {
    const day = dateOf(k)
    return day && day >= start && day <= end
  })
  let currentDailyTarget = null
  let currentBaseDaily = null
  let currentPeriodBaseTarget = null
  let balanceBeforeCurrent = balance
  for (const dayKey of currentDays) {
    const day = dateOf(dayKey)
    const record = latestForDay(driverTargets, day)
    if (!record) continue
    const baseDaily = baseDailyFor(record, applicableBreakEven, day)
    if (baseDaily == null) continue
    currentBaseDaily = baseDaily
    currentPeriodBaseTarget = periodBaseTarget(record, applicableBreakEven)
    // A carried surplus can fully cover today's base target, but must never
    // turn the displayed daily target negative. Keep the signed balance intact
    // so surplus credit remains available to offset later active days.
    currentDailyTarget = Math.max(0, baseDaily + balance)
    balanceBeforeCurrent = balance
    if (byDay.has(dayKey)) balance += baseDaily - byDay.get(dayKey)
  }
  return {
    available: currentDailyTarget != null,
    reason: currentDailyTarget == null ? 'NO_APPLICABLE_ACTIVE_DAY_TARGET' : null,
    balanceBefore: balanceBeforeCurrent,
    balance,
    currentDailyTarget,
    currentBaseDaily,
    currentPeriodBaseTarget,
    recoveryAdjustment: currentDailyTarget != null && currentBaseDaily != null ? currentDailyTarget - currentBaseDaily : null,
    surplusCreditBefore: Math.max(0, -balanceBeforeCurrent),
    surplusCredit: Math.max(0, -balance),
    carriedShortfall: Math.max(0, balance),
    activeDays: currentDays.length,
    authority: 'COMPLETED_SHIFT_REVENUE_AND_SHIFTS_FOR_ACTIVE_DAYS'
  }
}

export function stabilizeActiveDay({ baseTarget, balance = 0, actualRevenue = null } = {}) {
  const base = finite(baseTarget)
  if (base == null) return { available: false, target: null, nextBalance: null }
  const currentBalance = finite(balance) ?? 0
  const target = Math.max(0, base + currentBalance)
  if (actualRevenue == null) return { available: true, target, nextBalance: null }
  const actual = finite(actualRevenue)
  if (actual == null) return { available: true, target, nextBalance: null }
  return { available: true, target, nextBalance: currentBalance + base - actual }
}
