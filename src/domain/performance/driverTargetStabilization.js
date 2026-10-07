const finite = value => Number.isFinite(Number(value)) ? Number(value) : null
const dateOf = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null }
const istDayKey = value => {
  const date = dateOf(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = type => parts.find(part => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
const dayDate = key => {
  const [year, month, day] = String(key || '').split('-').map(Number)
  return [year, month, day].every(Number.isFinite) ? new Date(Date.UTC(year, month - 1, day)) : null
}
const calendarDays = (from, to) => {
  const start = dayDate(istDayKey(from))
  const end = dayDate(istDayKey(to))
  return start && end && end >= start ? Math.max(1, Math.round((end - start) / 86400000) + 1) : null
}
const live = records => (records || []).filter(record => !record?.deletedAt && record?.deleted !== true)
const applies = (record, dayKey) => {
  const from = istDayKey(record?.effectiveFrom || record?.validFrom || record?.startDate) || '1970-01-01'
  const until = istDayKey(record?.effectiveUntil || record?.validUntil || record?.endDate) || '9999-12-31'
  return record?.active !== false && record?.status !== 'INACTIVE' && from <= dayKey && dayKey <= until
}
const latestForDay = (records, dayKey) => live(records).filter(record => applies(record, dayKey)).sort((a, b) => {
  const af = istDayKey(a?.effectiveFrom || a?.validFrom || a?.startDate) || ''
  const bf = istDayKey(b?.effectiveFrom || b?.validFrom || b?.startDate) || ''
  return bf.localeCompare(af) || String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''))
})[0] || null
const periodDays = record => {
  const explicit = finite(record?.workingDays ?? record?.activeWorkingDays ?? record?.targetWorkingDays)
  if (explicit != null && explicit > 0) return explicit
  return calendarDays(record?.effectiveFrom || record?.validFrom || record?.startDate, record?.effectiveUntil || record?.validUntil || record?.endDate) || 1
}
const baseDailyFor = (record, applicableBreakEven) => {
  const desiredProfit = finite(record?.desiredDriverProfit ?? record?.desiredTakeHome ?? record?.desiredProfit)
  if (desiredProfit != null && Number.isFinite(Number(applicableBreakEven))) return (Number(applicableBreakEven) + desiredProfit) / periodDays(record)
  const configuredDaily = finite(record?.dailyTarget ?? record?.targetPerActiveDay)
  if (configuredDaily != null) return configuredDaily
  const configuredPeriod = finite(record?.targetRevenue ?? record?.target ?? record?.amount)
  return configuredPeriod == null ? null : configuredPeriod / periodDays(record)
}
export function deriveRollingDriverTarget({ trips = [], shifts = [], driverTargets = [], from, to, applicableBreakEven = null } = {}) {
  const startKey = istDayKey(from)
  const endKey = istDayKey(to)
  if (!startKey || !endKey || endKey < startKey) return { available: false, reason: 'INVALID_PERIOD', balanceBefore: null, balance: null, currentDailyTarget: null, currentBaseDaily: null, recoveryAdjustment: null, activeDays: 0 }
  const revenueByDay = new Map()
  for (const trip of live(trips).filter(item => item.status === 'COMPLETED')) {
    const day = istDayKey(trip.tripEndAt || trip.tripStartAt)
    if (day) revenueByDay.set(day, (revenueByDay.get(day) || 0) + (finite(trip.revenue) || 0))
  }
  const activeDaySet = new Set()
  for (const shift of live(shifts)) {
    const day = istDayKey(shift.shiftEndAt || shift.shiftStartAt)
    if (day) activeDaySet.add(day)
  }
  const allActiveDays = [...activeDaySet].sort()
  let balance = 0
  for (const dayKey of allActiveDays) {
    if (dayKey >= startKey) break
    const record = latestForDay(driverTargets, dayKey)
    if (!record) continue
    const baseDaily = baseDailyFor(record, applicableBreakEven)
    if (baseDaily == null) continue
    balance += baseDaily - (revenueByDay.get(dayKey) || 0)
  }
  const currentDays = allActiveDays.filter(dayKey => dayKey >= startKey && dayKey <= endKey)
  let currentDailyTarget = null
  let currentBaseDaily = null
  let balanceBeforeCurrent = balance
  for (const dayKey of currentDays) {
    const record = latestForDay(driverTargets, dayKey)
    if (!record) continue
    const baseDaily = baseDailyFor(record, applicableBreakEven)
    if (baseDaily == null) continue
    currentBaseDaily = baseDaily
    currentDailyTarget = baseDaily + balance
    balanceBeforeCurrent = balance
    balance += baseDaily - (revenueByDay.get(dayKey) || 0)
  }
  return {
    available: currentDailyTarget != null,
    reason: currentDailyTarget == null ? 'NO_APPLICABLE_ACTIVE_DAY_TARGET' : null,
    balanceBefore: balanceBeforeCurrent,
    balance,
    currentDailyTarget,
    currentBaseDaily,
    recoveryAdjustment: currentDailyTarget != null && currentBaseDaily != null ? currentDailyTarget - currentBaseDaily : null,
    activeDays: currentDays.length,
    authority: 'COMPLETED_TRIPS_FOR_REVENUE_AND_SHIFTS_FOR_ACTIVE_DAYS',
  }
}
