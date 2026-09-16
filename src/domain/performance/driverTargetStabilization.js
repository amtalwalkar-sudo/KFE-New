const finite = v => {
  if (v == null || v === '') return null
  return Number.isFinite(Number(v)) ? Number(v) : null
}
const dateOf = v => { const x = v ? new Date(v) : null; return x && !Number.isNaN(x.getTime()) ? x : null }
const keyOf = v => { const x = dateOf(v); return x ? x.toISOString().slice(0, 10) : null }
const live = xs => (xs || []).filter(x => !x?.deletedAt && x?.deleted !== true)
const effectiveFrom = x => dateOf(x?.effectiveFrom || x?.validFrom || x?.startDate)
const effectiveUntil = x => dateOf(x?.effectiveUntil || x?.validUntil || x?.endDate)
const applies = (x, day) => {
  const from = effectiveFrom(x) || new Date(0)
  const until = effectiveUntil(x) || new Date('9999-12-31T23:59:59.999Z')
  return x?.active !== false && x?.status !== 'INACTIVE' && from <= day && day <= until
}
const latestForDay = (xs, day) => live(xs).filter(x => applies(x, day)).sort((a, b) => String(b.effectiveFrom || b.startDate || '').localeCompare(String(a.effectiveFrom || a.startDate || '')))[0] || null
const calendarDays = (from, to) => {
  const a = dateOf(from), b = dateOf(to)
  return a && b && b >= a ? Math.max(1, Math.ceil((b - a) / 86400000) + 1) : null
}
const periodDays = record => {
  const explicit = finite(record?.workingDays ?? record?.activeWorkingDays ?? record?.targetWorkingDays)
  if (explicit != null && explicit > 0) return explicit
  return calendarDays(effectiveFrom(record), effectiveUntil(record)) || 1
}
const desiredDriverProfit = record => finite(record?.desiredDriverProfit ?? record?.desiredTakeHome ?? record?.desiredProfit)
const periodBaseTarget = (record, applicableBreakEven = null) => {
  const desiredProfit = desiredDriverProfit(record)
  const breakEven = finite(applicableBreakEven)
  if (desiredProfit == null || breakEven == null) return null
  return finite(breakEven + desiredProfit)
}
const baseDailyFor = (record, applicableBreakEven = null) => {
  const periodTarget = periodBaseTarget(record, applicableBreakEven)
  return finite(periodTarget) == null ? null : finite(periodTarget / periodDays(record))
}

export function deriveRollingDriverTarget({ trips = [], shifts = [], driverTargets = [], from, to, applicableBreakEven = null } = {}) {
  const start = dateOf(from), end = dateOf(to)
  if (!start || !end || end < start) return { available: false, reason: 'INVALID_PERIOD', balanceBefore: null, currentDailyTarget: null, periodBaseTarget: null }
  const completed = live(trips).filter(x => x.status === 'COMPLETED')
  const byDay = new Map()
  for (const trip of completed) {
    const day = keyOf(trip.tripEndAt || trip.tripStartAt)
    if (!day) continue
    byDay.set(day, (byDay.get(day) || 0) + (finite(trip.revenue) || 0))
  }
  const activeDaySet = new Set()
  for (const shift of live(shifts)) {
    const day = keyOf(shift.shiftEndAt || shift.shiftStartAt)
    if (day) activeDaySet.add(day)
  }
  const allActiveDays = [...activeDaySet].sort()
  let balance = 0
  let historicalBalanceComplete = true
  for (const dayKey of allActiveDays) {
    const day = dateOf(dayKey)
    if (!day || day >= start) break
    const record = latestForDay(driverTargets, day)
    if (!record) continue
    const baseDaily = baseDailyFor(record)
    if (baseDaily == null) {
      historicalBalanceComplete = false
      break
    }
    balance += baseDaily - (byDay.get(dayKey) || 0)
  }
  if (!historicalBalanceComplete) {
    return {
      available: false,
      reason: 'MISSING_HISTORICAL_BREAK_EVEN_FOR_ROLLING_BALANCE',
      balanceBefore: null,
      balance: null,
      currentDailyTarget: null,
      currentBaseDaily: null,
      currentPeriodBaseTarget: null,
      recoveryAdjustment: null,
      activeDays: allActiveDays.filter(k => {
        const day = dateOf(k)
        return day && day >= start && day <= end
      }).length,
      authority: 'COMPLETED_TRIPS_FOR_REVENUE_AND_SHIFTS_FOR_ACTIVE_DAYS'
    }
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
    const baseDaily = baseDailyFor(record, applicableBreakEven)
    if (baseDaily == null) continue
    currentBaseDaily = baseDaily
    currentPeriodBaseTarget = periodBaseTarget(record, applicableBreakEven)
    currentDailyTarget = baseDaily + balance
    balanceBeforeCurrent = balance
    balance += baseDaily - (byDay.get(dayKey) || 0)
  }
  const available = finite(currentDailyTarget) != null
  return {
    available,
    reason: available ? null : 'MISSING_AUTHORITATIVE_TARGET_INPUT',
    balanceBefore: balanceBeforeCurrent,
    balance,
    currentDailyTarget: available ? currentDailyTarget : null,
    currentBaseDaily: finite(currentBaseDaily) != null ? currentBaseDaily : null,
    currentPeriodBaseTarget: finite(currentPeriodBaseTarget) != null ? currentPeriodBaseTarget : null,
    recoveryAdjustment: available && finite(currentBaseDaily) != null ? currentDailyTarget - currentBaseDaily : null,
    activeDays: currentDays.length,
    authority: 'COMPLETED_TRIPS_FOR_REVENUE_AND_SHIFTS_FOR_ACTIVE_DAYS'
  }
}

export function stabilizeActiveDay({ baseTarget, balance = 0, actualRevenue = null } = {}) {
  const base = finite(baseTarget)
  if (base == null) return { available: false, target: null, nextBalance: null }
  const currentBalance = finite(balance) || 0
  const target = base + currentBalance
  if (actualRevenue == null) return { available: true, target, nextBalance: null }
  const actual = finite(actualRevenue) || 0
  return { available: true, target, nextBalance: currentBalance + base - actual }
}
