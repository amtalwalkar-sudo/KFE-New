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
const latestForDay = (xs, day) => live(xs).filter(x => applies(x, day)).sort((a, b) => { const dateCompare=String(effectiveDateKey(b)||'').localeCompare(String(effectiveDateKey(a)||'')); if(dateCompare!==0)return dateCompare; return String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')) })[0] || null
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
const failure = (reason, balance = null, activeDays = 0) => ({
  available: false, reason, balanceBefore: balance, balance, openingBalance: balance,
  monthlyBreakEvenRevenue: null, monthlyVariance: null, closingBalance: balance,
  desiredDriverProfitMonthly: null,
  effectiveMonthlyTarget: null, currentDailyTarget: null, currentBaseDaily: null,
  currentPeriodBaseTarget: null, recoveryAdjustment: null, activeDays,
  financialDays: activeDays, remainingEligibleDays: null,
  targetAllocatedBeforeCurrentDay: null, remainingObligation: null,
  authority: 'MONTHLY_BREAK_EVEN_PLUS_MONTHLY_DESIRED_PROFIT_WITH_MONTHLY_ROLLING_BALANCE_AND_DYNAMIC_REMAINING_ELIGIBLE_DAYS',
  evidence: calculationEvidence({ status: CALCULATION_STATUS.UNAVAILABLE, reason }),
})

export function deriveRollingDriverTarget({ trips = [], shifts = [], driverTargets = [], from, to, applicableBreakEven = null, historicalBreakEvenForDay = null, operatingKmForecast = null } = {}) {
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
  // A financial/target-bearing day requires at least one completed trip.
  // Shift start alone does not consume or create a target allocation.
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
  const financialDayKeys = [...(financialDaysByMonth.get(targetMonth) || new Set())].filter(k => k >= targetMonthStartKey && k <= endDayKey).sort()
  if (!financialDayKeys.length) return failure('NO_FINANCIAL_DRIVER_TARGET_DAY', null, 0)

  const currentDay = dayFromKey(financialDayKeys[financialDayKeys.length - 1])
  const currentMonth = targetMonth
  const historicalMonths = [...new Set([...revenueByMonth.keys()])].filter(month => month < currentMonth && monthBounds(month).from <= asOfBoundary).sort()

  let balance = 0
  const historicalState = []
  for (const month of historicalMonths) {
    const { from: monthStart } = monthBounds(month)
    const record = latestForDay(driverTargets, monthStart)
    if (!record) return failure('MISSING_HISTORICAL_DRIVER_TARGET_INPUT', null, financialDayKeys.length)
    const historicalBreakEven = typeof historicalBreakEvenForDay === 'function' ? historicalBreakEvenForDay({ record, day: monthStart }) : null
    const baseMonthly = baseMonthlyFor(record, historicalBreakEven)
    if (baseMonthly == null) return failure('MISSING_HISTORICAL_DRIVER_TARGET_INPUT', null, financialDayKeys.length)
    const openingBalance = balance
    const monthlyActualRevenue = revenueByMonth.get(month) || 0
    const monthlyVariance = baseMonthly - monthlyActualRevenue
    const closingBalance = openingBalance + monthlyVariance
    historicalState.push({ month, openingBalance, monthlyVariance, closingBalance, effectiveMonthlyTarget: baseMonthly + openingBalance })
    balance = closingBalance
  }

  const currentRecord = latestForDay(driverTargets, currentDay)
  if (!currentRecord) return failure('MISSING_AUTHORITATIVE_TARGET_INPUT', balance, financialDayKeys.length)
  const baseMonthly = baseMonthlyFor(currentRecord, applicableBreakEven)
  if (baseMonthly == null) return failure('MISSING_AUTHORITATIVE_TARGET_INPUT', balance, financialDayKeys.length)

  const effectiveMonthlyTarget = baseMonthly + balance
  const currentMonthFinancialDays = [...(financialDaysByMonth.get(currentMonth) || new Set())].sort()
  const priorFinancialDays = currentMonthFinancialDays.filter(day => day < keyOf(currentDay))
  const priorHolidayKeys = calendarDayKeys(currentMonth).filter(day => day < keyOf(currentDay) && !currentMonthFinancialDays.includes(day))

  let targetAllocatedBeforeCurrentDay = 0
  let priorRemainingObligation = effectiveMonthlyTarget
  for (const financialDay of priorFinancialDays) {
    const day = dayFromKey(financialDay)
    const holidaysKnownBeforeDay = calendarDayKeys(currentMonth).filter(candidate => candidate < financialDay && !currentMonthFinancialDays.includes(candidate))
    const denominator = remainingEligibleDays({ month: currentMonth, currentDay: day, priorHolidayKeys: holidaysKnownBeforeDay })
    const allocation = priorRemainingObligation / denominator
    targetAllocatedBeforeCurrentDay += allocation
    priorRemainingObligation -= allocation
  }

  const remainingDays = remainingEligibleDays({ month: currentMonth, currentDay, priorHolidayKeys })
  const remainingObligation = Math.max(0, effectiveMonthlyTarget - targetAllocatedBeforeCurrentDay)
  const currentBaseDaily = baseMonthly / remainingDays
  // Frozen operating-KM volume is the authoritative daily volume input.
  // 200 km/day is the neutral baseline; learned forecast changes the remaining
  // base-obligation share proportionally. Opening rolling recovery remains a
  // separate financial obligation, so KM learning cannot erase recovery.
  const forecastDailyKm = finite(operatingKmForecast?.dailyForecastKm)
  const normalPriorKm = Math.max(1, finite(operatingKmForecast?.config?.normalPriorKmPerCalendarDay) || 200)
  const operatingKmMultiplier = forecastDailyKm == null ? 1 : Math.max(0, forecastDailyKm / normalPriorKm)
  const baseRemainingDaily = Math.max(0, baseMonthly - (() => {
    let allocated = 0
    let remaining = baseMonthly
    for (const financialDay of priorFinancialDays) {
      const day = dayFromKey(financialDay)
      const holidaysKnownBeforeDay = calendarDayKeys(currentMonth).filter(candidate => candidate < financialDay && !currentMonthFinancialDays.includes(candidate))
      const denominator = remainingEligibleDays({ month: currentMonth, currentDay: day, priorHolidayKeys: holidaysKnownBeforeDay })
      const allocation = remaining / denominator
      allocated += allocation
      remaining -= allocation
    }
    return allocated
  })()) / remainingDays
  const recoveryAllocatedBeforeCurrentDay = (() => {
    let allocated = 0
    let remaining = Math.max(0, balance)
    for (const financialDay of priorFinancialDays) {
      const day = dayFromKey(financialDay)
      const holidaysKnownBeforeDay = calendarDayKeys(currentMonth).filter(candidate => candidate < financialDay && !currentMonthFinancialDays.includes(candidate))
      const denominator = remainingEligibleDays({ month: currentMonth, currentDay: day, priorHolidayKeys: holidaysKnownBeforeDay })
      const allocation = remaining / denominator
      allocated += allocation
      remaining -= allocation
    }
    return allocated
  })()
  const recoveryRemainingDaily = Math.max(0, Math.max(0, balance) - recoveryAllocatedBeforeCurrentDay) / remainingDays
  const currentDailyTarget = baseRemainingDaily * operatingKmMultiplier + recoveryRemainingDaily
  const recoveryAdjustment = currentDailyTarget - currentBaseDaily
  const monthlyActualRevenue = revenueByMonth.get(currentMonth) || 0
  const monthlyVariance = baseMonthly - monthlyActualRevenue
  const closingBalance = balance + monthlyVariance

  return {
    available: Number.isFinite(currentDailyTarget), reason: Number.isFinite(currentDailyTarget) ? null : 'MISSING_AUTHORITATIVE_TARGET_INPUT',
    balanceBefore: balance, balance, openingBalance: balance, monthlyBreakEvenRevenue: baseMonthly - readDriverProfit(currentRecord),
    desiredDriverProfitMonthly: readDriverProfit(currentRecord),
    monthlyTargetBase: baseMonthly,
    monthlyVariance, closingBalance, effectiveMonthlyTarget,
    currentDailyTarget: Number.isFinite(currentDailyTarget) ? currentDailyTarget : null,
    currentBaseDaily: Number.isFinite(currentBaseDaily) ? currentBaseDaily : null,
    operatingKmForecastDaily: forecastDailyKm,
    operatingKmMultiplier,
    currentPeriodBaseTarget: Number.isFinite(effectiveMonthlyTarget) ? effectiveMonthlyTarget : null,
    recoveryAdjustment: Number.isFinite(recoveryAdjustment) ? recoveryAdjustment : null,
    activeDays: financialDayKeys.length, financialDays: financialDayKeys.length, remainingEligibleDays: remainingDays,
    targetAllocatedBeforeCurrentDay, remainingObligation, currentTargetMonth: currentMonth, historicalState,
    authority: 'MONTHLY_BREAK_EVEN_PLUS_MONTHLY_DESIRED_PROFIT_WITH_MONTHLY_ROLLING_BALANCE_AND_DYNAMIC_REMAINING_ELIGIBLE_DAYS',
    evidence: calculationEvidence({ status: CALCULATION_STATUS.AUTHORITATIVE, source: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN' })
  }
}

export function stabilizeActiveDay({ baseTarget, balance = 0, actualRevenue = null } = {}) {
  const base = finite(baseTarget)
  if (base == null) return { available: false, target: null, nextBalance: null, evidence: calculationEvidence({ status: CALCULATION_STATUS.UNAVAILABLE, reason: 'MISSING_AUTHORITATIVE_TARGET_INPUT' }) }
  const currentBalance = finite(balance) || 0
  const target = base + currentBalance
  if (actualRevenue == null) return { available: true, target, nextBalance: null, evidence: calculationEvidence({ status: CALCULATION_STATUS.AUTHORITATIVE, source: 'MONTHLY_TARGET_BASE_PLUS_ROLLING_BALANCE' }) }
  const actual = finite(actualRevenue) || 0
  return { available: true, target, nextBalance: currentBalance + base - actual, evidence: calculationEvidence({ status: CALCULATION_STATUS.AUTHORITATIVE, source: 'MONTHLY_TARGET_BASE_PLUS_ROLLING_BALANCE' }) }
}
