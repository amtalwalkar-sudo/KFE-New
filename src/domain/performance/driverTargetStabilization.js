const finite = v => Number.isFinite(Number(v)) ? Number(v) : null
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
const periodBaseTarget = (record, applicableBreakEven = null) => {
  const desiredProfit = finite(record?.desiredDriverProfit ?? record?.desiredTakeHome ?? record?.desiredProfit)
  if (desiredProfit != null && applicableBreakEven != null) return applicableBreakEven + desiredProfit
  const configured = finite(record?.targetRevenue ?? record?.target ?? record?.amount)
  return configured
}
const baseDailyFor = (record, applicableBreakEven = null) => {
  const periodTarget = periodBaseTarget(record, applicableBreakEven)
  const dailyTarget = finite(record?.dailyTarget ?? record?.targetPerActiveDay)
  if (dailyTarget != null) return dailyTarget
  return periodTarget == null ? null : periodTarget / periodDays(record)
}

export function deriveRollingDriverTarget({ trips = [], driverTargets = [], from, to, applicableBreakEven = null } = {}) {
  const start = dateOf(from), end = dateOf(to)
  if (!start || !end || end < start) return { available: false, reason: 'INVALID_PERIOD', balanceBefore: null, currentDailyTarget: null, periodBaseTarget: null }
  const completed = live(trips).filter(x => x.status === 'COMPLETED')
  const byDay = new Map()
  for (const trip of completed) {
    const day = keyOf(trip.tripEndAt || trip.tripStartAt)
    if (!day) continue
    byDay.set(day, (byDay.get(day) || 0) + (finite(trip.revenue) || 0))
  }
  const allDays = [...byDay.keys()].sort()
  let balance = 0
  for (const dayKey of allDays) {
    const day = dateOf(dayKey)
    if (!day || day >= start) break
    const record = latestForDay(driverTargets, day)
    if (!record) continue
    const baseDaily = baseDailyFor(record)
    if (baseDaily == null) continue
    balance += baseDaily - (byDay.get(dayKey) || 0)
  }
  const currentDays = [...byDay.keys()].filter(k => {
    const d = dateOf(k); return d && d >= start && d <= end
  }).sort()
  let currentDailyTarget = null
  let currentBaseDaily = null
  let currentPeriodBaseTarget = null
  for (const dayKey of currentDays) {
    const day = dateOf(dayKey)
    const record = latestForDay(driverTargets, day)
    if (!record) continue
    const baseDaily = baseDailyFor(record, applicableBreakEven)
    if (baseDaily == null) continue
    currentBaseDaily = baseDaily
    currentPeriodBaseTarget = periodBaseTarget(record, applicableBreakEven)
    currentDailyTarget = baseDaily + balance
    const actual = byDay.get(dayKey) || 0
    balance += baseDaily - actual
  }
  if (currentDailyTarget == null) {
    const firstActive = new Date(Math.max(start.getTime(), Date.now()))
    const record = latestForDay(driverTargets, firstActive)
    if (record) {
      currentBaseDaily = baseDailyFor(record, applicableBreakEven)
      currentPeriodBaseTarget = periodBaseTarget(record, applicableBreakEven)
      currentDailyTarget = currentBaseDaily == null ? null : currentBaseDaily + balance
    }
  }
  return {
    available: currentDailyTarget != null,
    reason: currentDailyTarget == null ? 'NO_APPLICABLE_ACTIVE_DAY_TARGET' : null,
    balanceBefore: balance - (currentDailyTarget == null || currentBaseDaily == null ? 0 : 0),
    balance,
    currentDailyTarget,
    currentBaseDaily,
    currentPeriodBaseTarget,
    recoveryAdjustment: currentDailyTarget != null && currentBaseDaily != null ? currentDailyTarget - currentBaseDaily : null,
    activeDays: currentDays.length,
    authority: 'DERIVED_FROM_AUTHORITATIVE_COMPLETED_TRIPS_AND_DRIVER_TARGET_INPUTS'
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
