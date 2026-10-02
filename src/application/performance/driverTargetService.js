import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { deriveFinanceAwarePerformance } from '../../domain/performance/financePerformanceAdapter.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'
import { istMonthRange, getKfeReferenceNow } from '../../domain/time/ist.js'
import { normalizeCalculationSnapshot } from './normalizeCalculationSnapshot.js'
import { previousRange } from '../../domain/performance/performanceEngineV2.js'
import { deriveOperatingKmForecast } from '../../domain/performance/operatingKmForecast.js'

const monthlyBreakEvenCacheFor = snapshot => {
  const cache = new Map()
  return ({ day }) => {
    const monthRange = istMonthRange(day)
    if (!monthRange) return null
    const key = monthRange.from.toISOString().slice(0, 7)
    if (cache.has(key)) return cache.get(key)
    const metrics = deriveFinanceAwarePerformance(snapshot, monthRange, previousRange(monthRange))
    const value = Number.isFinite(metrics.monthlyBreakEvenRevenue) ? metrics.monthlyBreakEvenRevenue : null
    cache.set(key, value)
    return value
  }
}

export const DriverTargetService = Object.freeze({
  async getTarget(asOf = getKfeReferenceNow()) {
    const snapshot = normalizeCalculationSnapshot(await PerformanceRepository.getSnapshot())
    const monthRange = istMonthRange(asOf, asOf)
    if (!monthRange) return { available: false, target: null, reason: 'INVALID_TARGET_DATE' }
    const asOfDate = new Date(asOf)
    const targetTo = new Date(Math.min(monthRange.to.getTime(), asOfDate.getTime()))
    const asOfRange = { ...monthRange, to: targetTo }
    const metrics = deriveFinanceAwarePerformance(snapshot, asOfRange, previousRange(asOfRange))
    const monthlyBreakEvenRevenue = Number.isFinite(metrics.monthlyBreakEvenRevenue) ? metrics.monthlyBreakEvenRevenue : null
    const operatingKmForecast = deriveOperatingKmForecast({
      shifts: snapshot?.shifts,
      from: monthRange.from,
      to: targetTo,
      asOf: targetTo,
    })
    const monthlyIndicativeProfitCache = new Map()
    const historicalIndicativeProfitForMonth = ({ month, day }) => {
      if (monthlyIndicativeProfitCache.has(month)) return monthlyIndicativeProfitCache.get(month)
      const fullMonthRange = istMonthRange(day)
      if (!fullMonthRange) return null
      const monthMetrics = deriveFinanceAwarePerformance(snapshot, fullMonthRange, previousRange(fullMonthRange))
      const value = Number.isFinite(monthMetrics.performanceHeadlineProvisionalProfit)
        ? monthMetrics.performanceHeadlineProvisionalProfit
        : null
      monthlyIndicativeProfitCache.set(month, value)
      return value
    }
    const indicativeProfitForCurrentMonth = ({ month } = {}) => {
      if (monthlyIndicativeProfitCache.has(month)) return monthlyIndicativeProfitCache.get(month)
      const currentMonthAsOfRange = { ...monthRange, to: targetTo }
      const monthMetrics = deriveFinanceAwarePerformance(snapshot, currentMonthAsOfRange, previousRange(currentMonthAsOfRange))
      const value = Number.isFinite(monthMetrics.performanceHeadlineProvisionalProfit)
        ? monthMetrics.performanceHeadlineProvisionalProfit
        : null
      monthlyIndicativeProfitCache.set(month, value)
      return value
    }
    const stabilization = deriveRollingDriverTarget({
      trips: snapshot?.trips,
      shifts: snapshot?.shifts,
      driverTargets: snapshot?.driverTargets,
      from: monthRange.from,
      to: targetTo,
      applicableBreakEven: monthlyBreakEvenRevenue,
      historicalBreakEvenForDay: monthlyBreakEvenCacheFor(snapshot),
      authoritativeBreakEvenForMonth: monthlyBreakEvenCacheFor(snapshot),
      operatingKmForecast,
      historicalIndicativeProfitForMonth,
      indicativeProfitForCurrentMonth,
    })
    return {
      ...stabilization,
      target: stabilization.available && Number.isFinite(stabilization.currentDailyTarget) ? stabilization.currentDailyTarget : null,
    }
  },
  subscribeDataChanges(callback) {
    return subscribeCanonicalDataChanges(callback)
  },
})
