const finite = v => {
  if (v == null || v === '') return null
  return Number.isFinite(Number(v)) ? Number(v) : null
}
const dateOf = v => { const x = v ? new Date(v) : null; return x && !Number.isNaN(x.getTime()) ? x : null }
const keyOf = v => { const x = dateOf(v); return x ? x.toISOString().slice(0, 10) : null }
const monthKeyOf = v => { const x = dateOf(v); return x ? x.toISOString().slice(0, 7) : null }
const live = xs => (xs || []).filter(x => !x?.deletedAt && x?.deleted !== true)
const effectiveFrom = x => dateOf(x?.effectiveFrom || x?.validFrom || x?.startDate)
const effectiveUntil = x => dateOf(x?.effectiveUntil || x?.validUntil || x?.endDate)
const applies = (x, day) => {
  const from = effectiveFrom(x) || new Date(0)
  const until = effectiveUntil(x) || new Date('9999-12-31T23:59:59.999Z')
  return x?.active !== false && x?.status !== 'INACTIVE' && from <= day && day <= until
}
const latestForDay = (xs, day) => live(xs).filter(x => applies(x, day)).sort((a, b) => String(b.effectiveFrom || b.startDate || '').localeCompare(String(a.effectiveFrom || a.startDate || '')))[0] || null
const desiredDriverProfit = record => finite(record?.desiredDriverProfit ?? record?.desiredTakeHome ?? record?.desiredProfit)
const workingDays = record => {
  const value = finite(record?.workingDays ?? record?.targetWorkingDays ?? record?.activeWorkingDays)
  return value != null && value > 0 ? value : null
}
const baseMonthlyFor = (record, monthlyBreakEven = null) => {
  const desiredProfit = desiredDriverProfit(record)
  const breakEven = finite(monthlyBreakEven)
  if (desiredProfit == null || breakEven == null) return null
  return finite(breakEven + desiredProfit)
}
const dailyFromMonthly = (monthlyAmount, record) => {
  const days = workingDays(record)
  if (finite(monthlyAmount) == null || days == null) return null
  return finite(monthlyAmount / days)
}

export function deriveRollingDriverTarget({ trips = [], shifts = [], driverTargets = [], from, to, applicableBreakEven = null, historicalBreakEvenForDay = null, applicableBreakEvenForDay = null } = {}) {
  const start = dateOf(from), end = dateOf(to)
  if (!start || !end || end < start) return { available: false, reason: 'INVALID_PERIOD', balanceBefore: null, currentDailyTarget: null, currentBaseDaily: null }
  const completed = live(trips).filter(x => x.status === 'COMPLETED')
  const revenueByMonth = new Map()
  for (const trip of completed) {
    const month = monthKeyOf(trip.tripEndAt || trip.tripStartAt)
    if (!month) continue
    revenueByMonth.set(month, (revenueByMonth.get(month) || 0) + (finite(trip.revenue) || 0))
  }
  const activeDaysByMonth = new Map()
  for (const shift of live(shifts)) {
    const day = keyOf(shift.shiftEndAt || shift.shiftStartAt)
    const month = monthKeyOf(shift.shiftEndAt || shift.shiftStartAt)
    if (!day || !month) continue
    if (!activeDaysByMonth.has(month)) activeDaysByMonth.set(month, new Set())
    activeDaysByMonth.get(month).add(day)
  }
  const currentDayKeys = [...activeDaysByMonth.values()].flatMap(set => [...set]).filter(k => {
    const day = dateOf(k)
    return day && day >= start && day <= end
  }).sort()
  const currentMonths = [...new Set(currentDayKeys.map(monthKeyOf))].sort()
  if (!currentMonths.length) {
    return {
      available: false,
      reason: 'NO_ACTIVE_DRIVER_TARGET_DAY',
      balanceBefore: null,
      balance: null,
      currentDailyTarget: null,
      currentBaseDaily: null,
      currentPeriodBaseTarget: null,
      recoveryAdjustment: null,
      activeDays: 0,
      authority: 'COMPLETED_TRIPS_FOR_REVENUE_AND_SHIFTS_FOR_ACTIVE_DAYS'
    }
  }
  const firstCurrentMonth = currentMonths[0]
  let balance = 0
  let historicalBalanceComplete = true
  const historicalMonths = [...activeDaysByMonth.keys()].filter(month => month < firstCurrentMonth).sort()
  for (const month of historicalMonths) {
    const days = [...activeDaysByMonth.get(month)].sort()
    const day = dateOf(days[0])
    const record = latestForDay(driverTargets, day)
    if (!record) {
      historicalBalanceComplete = false
      break
    }
    const historicalBreakEven = typeof historicalBreakEvenForDay === 'function'
      ? historicalBreakEvenForDay({ record, day })
      : null
    const baseMonthly = baseMonthlyFor(record, historicalBreakEven)
    if (baseMonthly == null || workingDays(record) == null) {
      historicalBalanceComplete = false
      break
    }
    balance += baseMonthly - (revenueByMonth.get(month) || 0)
  }
  if (!historicalBalanceComplete) {
    return {
      available: false,
      reason: 'MISSING_HISTORICAL_DRIVER_TARGET_INPUT',
      balanceBefore: null,
      balance: null,
      currentDailyTarget: null,
      currentBaseDaily: null,
      currentPeriodBaseTarget: null,
      recoveryAdjustment: null,
      activeDays: currentDayKeys.length,
      authority: 'COMPLETED_TRIPS_FOR_REVENUE_AND_SHIFTS_FOR_ACTIVE_DAYS'
    }
  }
  let currentDailyTarget = null
  let currentBaseDaily = null
  let currentPeriodBaseTarget = null
  let balanceBeforeCurrent = balance
  let latestMonth = null
  for (const month of currentMonths) {
    const daysInMonth = [...(activeDaysByMonth.get(month) || [])].map(dateOf).filter(Boolean).sort((a, b) => a - b)
    const representativeDay = daysInMonth[0]
    const record = latestForDay(driverTargets, representativeDay)
    if (!record) continue
    const monthBreakEven = typeof applicableBreakEvenForDay === 'function'
      ? applicableBreakEvenForDay({ record, day: representativeDay })
      : applicableBreakEven
    const baseMonthly = baseMonthlyFor(record, monthBreakEven)
    const baseDaily = dailyFromMonthly(baseMonthly, record)
    if (baseDaily == null) continue
    const effectiveMonthlyTarget = baseMonthly + balance
    const dailyTarget = dailyFromMonthly(effectiveMonthlyTarget, record)
    if (dailyTarget == null) continue
    currentBaseDaily = baseDaily
    currentPeriodBaseTarget = baseDaily
    currentDailyTarget = dailyTarget
    balanceBeforeCurrent = balance
    latestMonth = month
    // Only a completed month rolls into the next month. The latest current month
    // remains the active target month and its partial/current results are not
    // rolled forward yet.
    if (month !== currentMonths[currentMonths.length - 1]) {
      balance += baseMonthly - (revenueByMonth.get(month) || 0)
    }
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
    activeDays: currentDayKeys.length,
    currentTargetMonth: latestMonth,
    authority: 'MONTHLY_BREAK_EVEN_PLUS_MONTHLY_DESIRED_PROFIT_WITH_MONTHLY_ROLLING_BALANCE_AND_SHIFT_DEFINED_ACTIVE_DAYS'
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
