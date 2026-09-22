import { istDateKey, istMonthKey } from '../time/ist.js'
import { authoritativeShiftRevenueByMonth } from './authoritativeRevenue.js'
import { CALCULATION_STATUS, calculationEvidence } from './calculationAuthority.js'

const finite = v => {
  if (v == null || v === '') return null
  return Number.isFinite(Number(v)) ? Number(v) : null
}
const dateOf = v => { const x = v ? new Date(v) : null; return x && !Number.isNaN(x.getTime()) ? x : null }
const keyOf = v => istDateKey(v)
const monthKeyOf = v => istMonthKey(v)
const dayFromKey = key => key ? new Date(`${key}T12:00:00+05:30`) : null
const endOfIstDay = key => key ? new Date(`${key}T23:59:59.999+05:30`) : null
const live = xs => (xs || []).filter(x => !x?.deletedAt && x?.deleted !== true)
const effectiveDateKey = x => keyOf(x?.effectiveFrom || x?.validFrom || x?.startDate)
const effectiveUntilKey = x => keyOf(x?.effectiveUntil || x?.validUntil || x?.endDate)
const applies = (x, day) => {
  const dayKey = keyOf(day)
  const fromKey = effectiveDateKey(x) || '1970-01-01'
  const untilKey = effectiveUntilKey(x) || '9999-12-31'
  return !!dayKey && x?.active !== false && x?.status !== 'INACTIVE' && fromKey <= dayKey && dayKey <= untilKey
}
const latestForDay = (xs, day) => live(xs).filter(x => applies(x, day)).sort((a, b) => {
  const dateCompare = String(effectiveDateKey(b) || '').localeCompare(String(effectiveDateKey(a) || ''))
  if (dateCompare !== 0) return dateCompare
  return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''))
})[0] || null
const readDriverProfit = record => finite(record?.desiredDriverProfit)
const baseMonthlyFor = (record, monthlyBreakEven = null) => {
  const driverProfit = readDriverProfit(record)
  const breakEven = finite(monthlyBreakEven)
  if (driverProfit == null || breakEven == null) return null
  return finite(breakEven + driverProfit)
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
const remainingEligibleDays = ({ month, currentDay, priorHolidayKeys = [] }) => {
  const currentKey = keyOf(currentDay)
  const holidays = new Set(priorHolidayKeys)
  const eligible = calendarDayKeys(month).filter(day => day >= currentKey && !holidays.has(day))
  return Math.max(1, eligible.length)
}
const failure = (reason, recovery = null, activeDays = 0) => ({
  available: false, reason,
  balanceBefore: recovery, balance: recovery, openingBalance: recovery,
  openingRecovery: recovery, newRecovery: null, recoveryAllocated: null, recoveryAchieved: null, closingRecovery: recovery,
  indicativeProfit: null, indicativeLoss: null,
  monthlyBreakEvenRevenue: null, monthlyVariance: null, closingBalance: recovery,
  desiredDriverProfitMonthly: null, effectiveMonthlyTarget: null, currentDailyTarget: null, currentBaseDaily: null,
  currentPeriodBaseTarget: null, recoveryAdjustment: null, dailyRecovery: null, activeDays,
  financialDays: activeDays, remainingEligibleDays: null,
  targetAllocatedBeforeCurrentDay: null, remainingObligation: null,
  recoveryAllocatedBeforeCurrentDay: null, recoveryRemaining: null,
  authority: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN_PLUS_DESIRED_DRIVER_PROFIT_PLUS_FINALIZED_PRIOR_LOSS_RECOVERY',
  evidence: calculationEvidence({ status: CALCULATION_STATUS.UNAVAILABLE, reason }),
})

const recoveryFromIndicativeProfit = ({ openingRecovery, indicativeProfit }) => {
  const opening = Math.max(0, finite(openingRecovery) || 0)
  const profit = finite(indicativeProfit)
  if (profit == null) return { newRecovery: null, recoveryAchieved: null, closingRecovery: null, indicativeLoss: null }
  const newRecovery = Math.max(0, -profit)
  const recoveryAchieved = Math.min(opening + newRecovery, Math.max(0, profit))
  const closingRecovery = Math.max(0, opening + newRecovery - recoveryAchieved)
  return { newRecovery, recoveryAchieved, closingRecovery, indicativeLoss: newRecovery }
}

export function deriveRollingDriverTarget({
  trips = [], shifts = [], driverTargets = [], from, to,
  applicableBreakEven = null, historicalBreakEvenForDay = null,
  historicalIndicativeProfitForMonth = null, indicativeProfitForCurrentMonth = null,
} = {}) {
  const start = dateOf(from), end = dateOf(to)
  if (!start || !end || end < start) return failure('INVALID_PERIOD')

  const endDayKey = keyOf(end)
  const asOfBoundary = endOfIstDay(endDayKey)
  const completed = live(trips).filter(x => {
    if (x.status !== 'COMPLETED') return false
    const tripDate = dateOf(x.tripEndAt || x.tripStartAt)
    const tripDayKey = tripDate ? keyOf(tripDate) : null
    return tripDayKey && tripDayKey <= endDayKey
  })
  const revenueByMonth = authoritativeShiftRevenueByMonth(shifts, asOfBoundary)
  const financialDaysByMonth = new Map()
  for (const trip of completed) {
    const tripDate = dateOf(trip.tripEndAt || trip.tripStartAt)
    const day = tripDate ? keyOf(tripDate) : null
    const month = tripDate ? monthKeyOf(tripDate) : null
    if (!month || !day || day > endDayKey) continue
    if (!financialDaysByMonth.has(month)) financialDaysByMonth.set(month, new Set())
    financialDaysByMonth.get(month).add(day)
  }

  const targetMonth = monthKeyOf(end)
  const targetMonthStartKey = keyOf(monthBounds(targetMonth).from)
  const financialDayKeys = [...(financialDaysByMonth.get(targetMonth) || new Set())]
    .filter(k => k >= targetMonthStartKey && k <= endDayKey).sort()
  if (!financialDayKeys.length) return failure('NO_FINANCIAL_DRIVER_TARGET_DAY', null, 0)

  const currentDay = dayFromKey(financialDayKeys[financialDayKeys.length - 1])
  const currentMonth = targetMonth
  const historicalMonths = [...new Set([...revenueByMonth.keys()])]
    .filter(month => month < currentMonth && monthBounds(month).from <= asOfBoundary).sort()

  let recovery = 0
  const historicalState = []
  for (const month of historicalMonths) {
    const { from: monthStart } = monthBounds(month)
    const record = latestForDay(driverTargets, monthStart)
    if (!record) return failure('MISSING_HISTORICAL_DRIVER_TARGET_INPUT', recovery, financialDayKeys.length)
    const historicalBreakEven = typeof historicalBreakEvenForDay === 'function'
      ? historicalBreakEvenForDay({ record, day: monthStart })
      : null
    const baseMonthly = baseMonthlyFor(record, historicalBreakEven)
    if (baseMonthly == null) return failure('MISSING_HISTORICAL_DRIVER_TARGET_INPUT', recovery, financialDayKeys.length)
    const indicativeProfit = typeof historicalIndicativeProfitForMonth === 'function'
      ? finite(historicalIndicativeProfitForMonth({ month, record, day: monthStart }))
      : null
    if (indicativeProfit == null) return failure('MISSING_HISTORICAL_INDICATIVE_PROFIT_INPUT', recovery, financialDayKeys.length)

    const openingRecovery = recovery
    const state = recoveryFromIndicativeProfit({ openingRecovery, indicativeProfit })
    const recoveryAllocated = openingRecovery + state.newRecovery
    historicalState.push({
      month, openingRecovery, newRecovery: state.newRecovery, recoveryAllocated,
      recoveryAchieved: state.recoveryAchieved, closingRecovery: state.closingRecovery,
      indicativeProfit, indicativeLoss: state.indicativeLoss,
      monthlyBreakEvenRevenue: historicalBreakEven,
      monthlyTargetBase: baseMonthly,
    })
    recovery = state.closingRecovery
  }

  const currentRecord = latestForDay(driverTargets, currentDay)
  if (!currentRecord) return failure('MISSING_AUTHORITATIVE_TARGET_INPUT', recovery, financialDayKeys.length)
  const baseMonthly = baseMonthlyFor(currentRecord, applicableBreakEven)
  if (baseMonthly == null) return failure('MISSING_AUTHORITATIVE_TARGET_INPUT', recovery, financialDayKeys.length)

  const openingRecovery = Math.max(0, recovery)
  const calendarDays = calendarDaysInMonth(currentMonth)
  const dailyRecovery = openingRecovery / calendarDays
  const currentMonthFinancialDays = [...(financialDaysByMonth.get(currentMonth) || new Set())].sort()
  const priorFinancialDays = currentMonthFinancialDays.filter(day => day < keyOf(currentDay))
  const priorHolidayKeys = calendarDayKeys(currentMonth).filter(day => day < keyOf(currentDay) && !currentMonthFinancialDays.includes(day))

  let targetAllocatedBeforeCurrentDay = 0
  let priorRemainingBaseObligation = baseMonthly
  for (const financialDay of priorFinancialDays) {
    const day = dayFromKey(financialDay)
    const holidaysKnownBeforeDay = calendarDayKeys(currentMonth)
      .filter(candidate => candidate < financialDay && !currentMonthFinancialDays.includes(candidate))
    const denominator = remainingEligibleDays({ month: currentMonth, currentDay: day, priorHolidayKeys: holidaysKnownBeforeDay })
    const allocation = priorRemainingBaseObligation / denominator
    targetAllocatedBeforeCurrentDay += allocation
    priorRemainingBaseObligation -= allocation
  }

  const elapsedCalendarDaysBeforeCurrent = Math.max(0, calendarDayKeys(currentMonth).filter(day => day < keyOf(currentDay)).length)
  const recoveryAllocatedBeforeCurrentDay = Math.min(openingRecovery, elapsedCalendarDaysBeforeCurrent * dailyRecovery)
  const recoveryRemaining = Math.max(0, openingRecovery - recoveryAllocatedBeforeCurrentDay)
  const remainingDays = remainingEligibleDays({ month: currentMonth, currentDay, priorHolidayKeys })
  const remainingObligation = Math.max(0, baseMonthly - targetAllocatedBeforeCurrentDay)
  const currentBaseDaily = baseMonthly / remainingDays
  const currentDailyTarget = currentBaseDaily + dailyRecovery
  const recoveryAdjustment = dailyRecovery
  const currentIndicativeProfit = typeof indicativeProfitForCurrentMonth === 'function'
    ? finite(indicativeProfitForCurrentMonth({ month: currentMonth, record: currentRecord, day: currentDay }))
    : null
  const currentRecoveryState = currentIndicativeProfit == null
    ? { newRecovery: null, recoveryAchieved: null, closingRecovery: null, indicativeLoss: null }
    : recoveryFromIndicativeProfit({ openingRecovery, indicativeProfit: currentIndicativeProfit })

  return {
    available: Number.isFinite(currentDailyTarget), reason: Number.isFinite(currentDailyTarget) ? null : 'MISSING_AUTHORITATIVE_TARGET_INPUT',
    balanceBefore: openingRecovery, balance: openingRecovery, openingBalance: openingRecovery,
    openingRecovery, newRecovery: currentRecoveryState.newRecovery,
    recoveryAllocated: openingRecovery, recoveryAchieved: currentRecoveryState.recoveryAchieved,
    closingRecovery: currentRecoveryState.closingRecovery,
    indicativeProfit: currentIndicativeProfit, indicativeLoss: currentRecoveryState.indicativeLoss,
    monthlyBreakEvenRevenue: finite(applicableBreakEven),
    desiredDriverProfitMonthly: readDriverProfit(currentRecord),
    monthlyTargetBase: baseMonthly,
    monthlyVariance: currentIndicativeProfit == null ? null : -currentIndicativeProfit,
    closingBalance: currentRecoveryState.closingRecovery,
    effectiveMonthlyTarget: baseMonthly + openingRecovery,
    currentDailyTarget: Number.isFinite(currentDailyTarget) ? currentDailyTarget : null,
    currentBaseDaily: Number.isFinite(currentBaseDaily) ? currentBaseDaily : null,
    currentPeriodBaseTarget: Number.isFinite(baseMonthly + openingRecovery) ? baseMonthly + openingRecovery : null,
    recoveryAdjustment: Number.isFinite(recoveryAdjustment) ? recoveryAdjustment : null,
    dailyRecovery: Number.isFinite(dailyRecovery) ? dailyRecovery : null,
    activeDays: financialDayKeys.length, financialDays: financialDayKeys.length, remainingEligibleDays: remainingDays,
    targetAllocatedBeforeCurrentDay, remainingObligation,
    recoveryAllocatedBeforeCurrentDay, recoveryRemaining,
    currentTargetMonth: currentMonth, historicalState,
    authority: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN_PLUS_DESIRED_DRIVER_PROFIT_PLUS_FINALIZED_PRIOR_LOSS_RECOVERY',
    evidence: calculationEvidence({ status: CALCULATION_STATUS.AUTHORITATIVE, source: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN_AND_FINALIZED_PRIOR_LOSS_RECOVERY' })
  }
}

export function stabilizeActiveDay({ baseTarget, balance = 0, actualRevenue = null } = {}) {
  const base = finite(baseTarget)
  if (base == null) return { available: false, target: null, nextBalance: null, evidence: calculationEvidence({ status: CALCULATION_STATUS.UNAVAILABLE, reason: 'MISSING_AUTHORITATIVE_TARGET_INPUT' }) }
  const openingRecovery = Math.max(0, finite(balance) || 0)
  const target = base + openingRecovery
  if (actualRevenue == null) return { available: true, target, nextBalance: null, evidence: calculationEvidence({ status: CALCULATION_STATUS.AUTHORITATIVE, source: 'MONTHLY_TARGET_BASE_PLUS_OPENING_RECOVERY' }) }
  const actual = finite(actualRevenue) || 0
  const indicativeProfit = actual - base
  const state = recoveryFromIndicativeProfit({ openingRecovery, indicativeProfit })
  return { available: true, target, nextBalance: state.closingRecovery, newRecovery: state.newRecovery, recoveryAchieved: state.recoveryAchieved, indicativeProfit, evidence: calculationEvidence({ status: CALCULATION_STATUS.AUTHORITATIVE, source: 'MONTHLY_TARGET_PLUS_LOSS_RECOVERY' }) }
}
