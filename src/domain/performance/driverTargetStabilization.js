import { istDateKey, istMonthKey } from '../time/ist.js'

const finite = v => {
  if (v == null || v === '') return null
  return Number.isFinite(Number(v)) ? Number(v) : null
}
const dateOf = v => { const x = v ? new Date(v) : null; return x && !Number.isNaN(x.getTime()) ? x : null }
const keyOf = v => istDateKey(v)
const monthKeyOf = v => istMonthKey(v)
const live = xs => (xs || []).filter(x => !x?.deletedAt && x?.deleted !== true)
const effectiveFrom = x => dateOf(x?.effectiveFrom || x?.validFrom || x?.startDate)
const effectiveUntil = x => dateOf(x?.effectiveUntil || x?.validUntil || x?.endDate)
const applies = (x, day) => {
  const from = effectiveFrom(x) || new Date(0)
  const until = effectiveUntil(x) || new Date('9999-12-31T23:59:59.999Z')
  return x?.active !== false && x?.status !== 'INACTIVE' && from <= day && day <= until
}
const latestForDay = (xs, day) => live(xs).filter(x => applies(x, day)).sort((a, b) => String(effectiveFrom(b) || '').localeCompare(String(effectiveFrom(a) || '')))[0] || null
const desiredDriverProfit = record => finite(record?.desiredDriverProfit)
const baseMonthlyFor = (record, monthlyBreakEven = null) => {
  const desiredProfit = desiredDriverProfit(record)
  const breakEven = finite(monthlyBreakEven)
  if (desiredProfit == null || breakEven == null) return null
  return finite(breakEven + desiredProfit)
}

const monthBounds = month => {
  const [year, monthNumber] = month.split('-').map(Number)
  const from = new Date(Date.UTC(year, monthNumber - 1, 1) - 330 * 60000)
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1) - 330 * 60000)
  return { from, to: new Date(nextMonth.getTime() - 1) }
}
const calendarDaysInMonth = month => {
  const { from, to } = monthBounds(month)
  return Math.floor((to - from) / 86400000) + 1
}
const calendarDayKeys = month => {
  const { from } = monthBounds(month)
  const count = calendarDaysInMonth(month)
  return Array.from({ length: count }, (_, i) => keyOf(new Date(from.getTime() + i * 86400000)))
}

// A target is allocated only on a financial day (a day with a completed trip).
// All calendar days are eligible by default. A known holiday therefore remains
// outside the remaining-day denominator, redistributing untouched obligation
// across later eligible financial days.
const remainingEligibleDays = ({ month, currentDay, priorHolidayKeys = [] }) => {
  const currentKey = keyOf(currentDay)
  const holidays = new Set(priorHolidayKeys)
  const eligible = calendarDayKeys(month).filter(day => day >= currentKey && !holidays.has(day))
  return Math.max(1, eligible.length)
}

const failure = (reason, balance = null, activeDays = 0) => ({
  available: false,
  reason,
  balanceBefore: balance,
  balance,
  openingBalance: balance,
  monthlyVariance: null,
  closingBalance: balance,
  effectiveMonthlyTarget: null,
  currentDailyTarget: null,
  currentBaseDaily: null,
  currentPeriodBaseTarget: null,
  recoveryAdjustment: null,
  activeDays,
  financialDays: activeDays,
  remainingEligibleDays: null,
  targetAllocatedBeforeCurrentDay: null,
  authority: 'MONTHLY_BREAK_EVEN_PLUS_MONTHLY_DESIRED_PROFIT_WITH_MONTHLY_ROLLING_BALANCE_AND_DYNAMIC_REMAINING_ELIGIBLE_DAYS'
})

export function deriveRollingDriverTarget({ trips = [], shifts = [], driverTargets = [], from, to, applicableBreakEven = null, historicalBreakEvenForDay = null, applicableBreakEvenForDay = null } = {}) {
  const start = dateOf(from), end = dateOf(to)
  if (!start || !end || end < start) return failure('INVALID_PERIOD')

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
  if (!financialDayKeys.length) return failure('NO_FINANCIAL_DRIVER_TARGET_DAY', null, 0)

  const currentDay = dateOf(financialDayKeys[financialDayKeys.length - 1])
  const currentMonth = monthKeyOf(currentDay)
  const targetMonths = live(driverTargets).map(x => monthKeyOf(effectiveFrom(x))).filter(Boolean)
  const historicalMonths = [...new Set([...revenueByMonth.keys(), ...targetMonths])]
    .filter(month => month < currentMonth)
    .sort()

  let balance = 0
  const historicalState = []
  for (const month of historicalMonths) {
    const { from: monthStart } = monthBounds(month)
    const record = latestForDay(driverTargets, monthStart)
    if (!record) return failure('MISSING_HISTORICAL_DRIVER_TARGET_INPUT', null, financialDayKeys.length)
    const historicalBreakEven = typeof historicalBreakEvenForDay === 'function'
      ? historicalBreakEvenForDay({ record, day: monthStart })
      : null
    const baseMonthly = baseMonthlyFor(record, historicalBreakEven)
    if (baseMonthly == null) return failure('MISSING_HISTORICAL_DRIVER_TARGET_INPUT', null, financialDayKeys.length)
    const openingBalance = balance
    const monthlyVariance = baseMonthly - (revenueByMonth.get(month) || 0)
    const closingBalance = openingBalance + monthlyVariance
    historicalState.push({ month, openingBalance, monthlyVariance, closingBalance, effectiveMonthlyTarget: baseMonthly + openingBalance })
    balance = closingBalance
  }

  const currentRecord = latestForDay(driverTargets, currentDay)
  if (!currentRecord) return failure('MISSING_AUTHORITATIVE_TARGET_INPUT', balance, financialDayKeys.length)

  const monthBreakEven = typeof applicableBreakEvenForDay === 'function'
    ? applicableBreakEvenForDay({ record: currentRecord, day: currentDay })
    : applicableBreakEven
  const baseMonthly = baseMonthlyFor(currentRecord, monthBreakEven)
  if (baseMonthly == null) return failure('MISSING_AUTHORITATIVE_TARGET_INPUT', balance, financialDayKeys.length)

  const effectiveMonthlyTarget = baseMonthly + balance
  const currentMonthFinancialDays = [...(financialDaysByMonth.get(currentMonth) || new Set())].sort()
  const priorFinancialDays = currentMonthFinancialDays.filter(day => day < keyOf(currentDay))
  const priorHolidayKeys = calendarDayKeys(currentMonth).filter(day => day < keyOf(currentDay) && !currentMonthFinancialDays.includes(day))

  let targetAllocatedBeforeCurrentDay = 0
  let priorRemainingObligation = effectiveMonthlyTarget
  for (const financialDay of priorFinancialDays) {
    const day = dateOf(financialDay)
    const holidaysKnownBeforeDay = calendarDayKeys(currentMonth).filter(candidate => {
      if (candidate >= financialDay) return false
      return !currentMonthFinancialDays.includes(candidate)
    })
    const denominator = remainingEligibleDays({ month: currentMonth, currentDay: day, priorHolidayKeys: holidaysKnownBeforeDay })
    const allocation = priorRemainingObligation / denominator
    targetAllocatedBeforeCurrentDay += allocation
    priorRemainingObligation -= allocation
  }

  const remainingDays = remainingEligibleDays({ month: currentMonth, currentDay, priorHolidayKeys })
  const remainingObligation = Math.max(0, effectiveMonthlyTarget - targetAllocatedBeforeCurrentDay)
  const currentDailyTarget = remainingObligation / remainingDays
  const currentBaseDaily = baseMonthly / remainingDays
  const recoveryAdjustment = currentDailyTarget - currentBaseDaily
  const monthlyActualRevenue = revenueByMonth.get(currentMonth) || 0
  const monthlyVariance = baseMonthly - monthlyActualRevenue
  const closingBalance = balance + monthlyVariance

  return {
    available: Number.isFinite(currentDailyTarget),
    reason: Number.isFinite(currentDailyTarget) ? null : 'MISSING_AUTHORITATIVE_TARGET_INPUT',
    balanceBefore: balance,
    balance,
    openingBalance: balance,
    monthlyVariance,
    closingBalance,
    effectiveMonthlyTarget,
    currentDailyTarget: Number.isFinite(currentDailyTarget) ? currentDailyTarget : null,
    currentBaseDaily: Number.isFinite(currentBaseDaily) ? currentBaseDaily : null,
    currentPeriodBaseTarget: Number.isFinite(effectiveMonthlyTarget) ? effectiveMonthlyTarget : null,
    recoveryAdjustment: Number.isFinite(recoveryAdjustment) ? recoveryAdjustment : null,
    activeDays: financialDayKeys.length,
    financialDays: financialDayKeys.length,
    remainingEligibleDays: remainingDays,
    targetAllocatedBeforeCurrentDay,
    remainingObligation,
    currentTargetMonth: currentMonth,
    historicalState,
    authority: 'MONTHLY_BREAK_EVEN_PLUS_MONTHLY_DESIRED_PROFIT_WITH_MONTHLY_ROLLING_BALANCE_AND_DYNAMIC_REMAINING_ELIGIBLE_DAYS'
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
