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
const latestForDay = (xs, day) => live(xs).filter(x => applies(x, day)).sort((a, b) => String(effectiveFrom(b) || '').localeCompare(String(effectiveFrom(a) || '')))[0] || null
const desiredDriverProfit = record => finite(record?.desiredDriverProfit ?? record?.desiredTakeHome ?? record?.desiredProfit)
const configuredWorkingDays = record => {
  const value = finite(record?.workingDays ?? record?.targetWorkingDays ?? record?.activeWorkingDays)
  return value != null && value > 0 ? value : null
}
const calendarDaysInMonth = month => {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
}
const baseMonthlyFor = (record, monthlyBreakEven = null) => {
  const desiredProfit = desiredDriverProfit(record)
  const breakEven = finite(monthlyBreakEven)
  if (desiredProfit == null || breakEven == null) return null
  return finite(breakEven + desiredProfit)
}
const monthBounds = month => {
  const [year, monthNumber] = month.split('-').map(Number)
  return {
    from: new Date(Date.UTC(year, monthNumber - 1, 1)),
    to: new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999))
  }
}
const daysBetweenInclusive = (from, to) => Math.max(0, Math.floor((to - from) / 86400000) + 1)
const currentMonthRemainingEligibleDays = ({ month, currentDay, financialDayKeys, workingDays }) => {
  const { from, to } = monthBounds(month)
  const current = currentDay < from ? from : currentDay > to ? to : currentDay
  const financialDaysBefore = new Set(financialDayKeys.filter(day => day < keyOf(current)))
  if (workingDays != null) return Math.max(1, workingDays - financialDaysBefore.size)
  let remaining = 0
  for (let i = 0; i < daysBetweenInclusive(current, to); i += 1) {
    const day = new Date(current.getTime() + i * 86400000)
    if (!financialDaysBefore.has(keyOf(day))) remaining += 1
  }
  return Math.max(1, Math.min(calendarDaysInMonth(month), remaining))
}

export function deriveRollingDriverTarget({ trips = [], shifts = [], driverTargets = [], from, to, applicableBreakEven = null, historicalBreakEvenForDay = null, applicableBreakEvenForDay = null } = {}) {
  const start = dateOf(from), end = dateOf(to)
  if (!start || !end || end < start) return { available: false, reason: 'INVALID_PERIOD', balanceBefore: null, currentDailyTarget: null }

  const completed = live(trips).filter(x => x.status === 'COMPLETED')
  const revenueByMonth = new Map()
  const financialDaysByMonth = new Map()
  for (const trip of completed) {
    const day = keyOf(trip.tripEndAt || trip.tripStartAt)
    const month = monthKeyOf(trip.tripEndAt || trip.tripStartAt)
    if (!month || !day) continue
    revenueByMonth.set(month, (revenueByMonth.get(month) || 0) + (finite(trip.revenue) || 0))
    if (!financialDaysByMonth.has(month)) financialDaysByMonth.set(month, new Set())
    financialDaysByMonth.get(month).add(day)
  }

  const financialDayKeys = [...financialDaysByMonth.values()].flatMap(set => [...set]).filter(k => {
    const day = dateOf(k)
    return day && day >= start && day <= end
  }).sort()
  if (!financialDayKeys.length) {
    return {
      available: false,
      reason: 'NO_FINANCIAL_DRIVER_TARGET_DAY',
      balanceBefore: null,
      balance: null,
      openingBalance: null,
      monthlyVariance: null,
      closingBalance: null,
      effectiveMonthlyTarget: null,
      currentDailyTarget: null,
      currentBaseDaily: null,
      currentPeriodBaseTarget: null,
      recoveryAdjustment: null,
      activeDays: 0,
      financialDays: 0,
      authority: 'COMPLETED_TRIPS_DEFINE_FINANCIAL_DAYS'
    }
  }

  const currentDay = dateOf(financialDayKeys[financialDayKeys.length - 1])
  const currentMonth = monthKeyOf(currentDay)
  const targetMonths = live(driverTargets).map(x => monthKeyOf(effectiveFrom(x))).filter(Boolean)
  const historicalMonths = [...new Set([
    ...revenueByMonth.keys(),
    ...targetMonths,
  ])].filter(month => month < currentMonth).sort()

  let balance = 0
  const historicalState = []
  for (const month of historicalMonths) {
    const { from: monthStart } = monthBounds(month)
    const record = latestForDay(driverTargets, monthStart)
    if (!record) return {
      available: false, reason: 'MISSING_HISTORICAL_DRIVER_TARGET_INPUT', balanceBefore: null, balance: null,
      openingBalance: null, monthlyVariance: null, closingBalance: null, effectiveMonthlyTarget: null,
      currentDailyTarget: null, currentBaseDaily: null, currentPeriodBaseTarget: null, recoveryAdjustment: null,
      activeDays: financialDayKeys.length, financialDays: financialDayKeys.length,
      authority: 'COMPLETED_TRIPS_DEFINE_FINANCIAL_DAYS'
    }
    const historicalBreakEven = typeof historicalBreakEvenForDay === 'function'
      ? historicalBreakEvenForDay({ record, day: monthStart })
      : null
    const baseMonthly = baseMonthlyFor(record, historicalBreakEven)
    if (baseMonthly == null) return {
      available: false, reason: 'MISSING_HISTORICAL_DRIVER_TARGET_INPUT', balanceBefore: null, balance: null,
      openingBalance: null, monthlyVariance: null, closingBalance: null, effectiveMonthlyTarget: null,
      currentDailyTarget: null, currentBaseDaily: null, currentPeriodBaseTarget: null, recoveryAdjustment: null,
      activeDays: financialDayKeys.length, financialDays: financialDayKeys.length,
      authority: 'COMPLETED_TRIPS_DEFINE_FINANCIAL_DAYS'
    }
    const openingBalance = balance
    const monthlyVariance = baseMonthly - (revenueByMonth.get(month) || 0)
    const closingBalance = openingBalance + monthlyVariance
    historicalState.push({ month, openingBalance, monthlyVariance, closingBalance, effectiveMonthlyTarget: baseMonthly + openingBalance })
    balance = closingBalance
  }

  const currentRecord = latestForDay(driverTargets, currentDay)
  if (!currentRecord) return {
    available: false, reason: 'MISSING_AUTHORITATIVE_TARGET_INPUT', balanceBefore: balance, balance,
    openingBalance: balance, monthlyVariance: null, closingBalance: balance, effectiveMonthlyTarget: null,
    currentDailyTarget: null, currentBaseDaily: null, currentPeriodBaseTarget: null, recoveryAdjustment: null,
    activeDays: financialDayKeys.length, financialDays: financialDayKeys.length,
    authority: 'COMPLETED_TRIPS_DEFINE_FINANCIAL_DAYS'
  }

  const monthBreakEven = typeof applicableBreakEvenForDay === 'function'
    ? applicableBreakEvenForDay({ record: currentRecord, day: currentDay })
    : applicableBreakEven
  const baseMonthly = baseMonthlyFor(currentRecord, monthBreakEven)
  const workingDays = configuredWorkingDays(currentRecord) ?? calendarDaysInMonth(currentMonth)
  if (baseMonthly == null || workingDays <= 0) return {
    available: false, reason: 'MISSING_AUTHORITATIVE_TARGET_INPUT', balanceBefore: balance, balance,
    openingBalance: balance, monthlyVariance: null, closingBalance: balance, effectiveMonthlyTarget: null,
    currentDailyTarget: null, currentBaseDaily: null, currentPeriodBaseTarget: null, recoveryAdjustment: null,
    activeDays: financialDayKeys.length, financialDays: financialDayKeys.length,
    authority: 'COMPLETED_TRIPS_DEFINE_FINANCIAL_DAYS'
  }

  const effectiveMonthlyTarget = baseMonthly + balance
  const currentMonthFinancialDays = financialDaysByMonth.get(currentMonth) || new Set()
  const remainingEligibleDays = currentMonthRemainingEligibleDays({
    month: currentMonth,
    currentDay,
    financialDayKeys: [...currentMonthFinancialDays],
    workingDays: configuredWorkingDays(currentRecord)
  })
  // Current-month actual revenue changes the month-end variance, not today's
  // target. Only the closed-month carried balance changes the effective target.
  const currentDailyTarget = effectiveMonthlyTarget / remainingEligibleDays
  const baseDaily = baseMonthly / workingDays
  const recoveryAdjustment = currentDailyTarget - baseDaily
  const monthlyActualRevenue = revenueByMonth.get(currentMonth) || 0
  const monthlyVariance = baseMonthly - monthlyActualRevenue
  const closingBalance = balance + monthlyVariance

  return {
    available: Number.isFinite(currentDailyTarget),
    reason: Number.isFinite(currentDailyTarget) ? null : 'MISSING_AUTHORITATIVE_TARGET_INPUT',
    balanceBefore: balance,
    // `balance` is the carried opening balance for the active month. The
    // provisional current-month closing balance is exposed separately.
    balance,
    openingBalance: balance,
    monthlyVariance,
    closingBalance,
    effectiveMonthlyTarget,
    currentDailyTarget: Number.isFinite(currentDailyTarget) ? currentDailyTarget : null,
    currentBaseDaily: Number.isFinite(baseDaily) ? baseDaily : null,
    currentPeriodBaseTarget: Number.isFinite(effectiveMonthlyTarget) ? effectiveMonthlyTarget : null,
    recoveryAdjustment: Number.isFinite(recoveryAdjustment) ? recoveryAdjustment : null,
    activeDays: financialDayKeys.length,
    financialDays: financialDayKeys.length,
    remainingEligibleDays,
    currentTargetMonth: currentMonth,
    historicalState,
    authority: 'MONTHLY_BREAK_EVEN_PLUS_MONTHLY_DESIRED_PROFIT_WITH_MONTHLY_ROLLING_BALANCE_AND_FINANCIAL_DAY_SMOOTHING'
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
