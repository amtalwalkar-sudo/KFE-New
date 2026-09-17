import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { deriveFinanceAwarePerformance } from '../../domain/performance/financePerformanceAdapter.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'
import { istMonthRange } from '../../domain/time/ist.js'
import { normalizeCalculationSnapshot } from './normalizeCalculationSnapshot.js'

const monthlyBreakEvenCacheFor = snapshot => {
  const cache = new Map()
  return ({ day }) => {
    const monthRange = istMonthRange(day)
    if (!monthRange) return null
    const key = monthRange.from.toISOString().slice(0, 7)
    if (cache.has(key)) return cache.get(key)
    const metrics = deriveFinanceAwarePerformance(snapshot, monthRange, null)
    const value = Number.isFinite(metrics.monthlyBreakEvenRevenue) ? metrics.monthlyBreakEvenRevenue : null
    cache.set(key, value)
    return value
  }
}

export const DriverTargetService = Object.freeze({
  async getTarget(asOf = new Date()) {
    const snapshot = normalizeCalculationSnapshot(await PerformanceRepository.getSnapshot())
    const range = istMonthRange(asOf)
    if (!range) return { available: false, target: null, reason: 'INVALID_TARGET_DATE' }
    const monthRange = istMonthRange(asOf, asOf)
    const targetTo = new Date(Math.min(monthRange.to.getTime(), new Date(asOf).getTime()))
    const metrics = deriveFinanceAwarePerformance(snapshot, range, null)
    const monthlyBreakEvenRevenue = Number.isFinite(metrics.monthlyBreakEvenRevenue) ? metrics.monthlyBreakEvenRevenue : null
    const stabilization = deriveRollingDriverTarget({
      trips: snapshot?.trips,
      shifts: snapshot?.shifts,
      driverTargets: snapshot?.driverTargets,
      from: monthRange.from,
      to: targetTo,
      applicableBreakEven: monthlyBreakEvenRevenue,
      historicalBreakEvenForDay: monthlyBreakEvenCacheFor(snapshot),
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
