import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { deriveFinanceAwarePerformance } from '../../domain/performance/financePerformanceAdapter.js'
import { deriveAuthoritativeDriverTarget, getApplicableDriverTarget } from '../../domain/performance/driverTarget.js'
import { istMonthRange, istCalendarDaysInclusive, getKfeReferenceNow } from '../../domain/time/ist.js'
import { normalizeCalculationSnapshot } from './normalizeCalculationSnapshot.js'
import { previousRange } from '../../domain/performance/performanceEngineV2.js'

export const DriverTargetService = Object.freeze({
  async getTarget(asOf = getKfeReferenceNow()) {
    const snapshot = normalizeCalculationSnapshot(await PerformanceRepository.getSnapshot())
    const monthRange = istMonthRange(asOf, asOf)
    if (!monthRange) return { available: false, target: null, reason: 'INVALID_TARGET_DATE' }

    const asOfDate = new Date(asOf)
    const targetTo = new Date(Math.min(monthRange.to.getTime(), asOfDate.getTime()))
    const asOfRange = { ...monthRange, to: targetTo }
    const metrics = deriveFinanceAwarePerformance(snapshot, asOfRange, previousRange(asOfRange))
    const monthlyBreakEvenRevenue = Number.isFinite(metrics.monthlyBreakEvenRevenue)
      ? metrics.monthlyBreakEvenRevenue
      : null
    const targetRecord = getApplicableDriverTarget(snapshot?.driverTargets, targetTo)
    const desiredDriverProfitMonthly = Number.isFinite(Number(targetRecord?.desiredDriverProfit))
      ? Number(targetRecord.desiredDriverProfit)
      : null
    const calendarDays = istCalendarDaysInclusive(monthRange.from, monthRange.to)
    const formula = deriveAuthoritativeDriverTarget({
      monthlyBreakEvenRevenue,
      desiredDriverProfitMonthly,
      calendarDays,
    })

    return {
      ...formula,
      target: formula.available ? formula.dailyTarget : null,
      monthlyBreakEvenRevenue,
      desiredDriverProfitMonthly,
      calendarDays,
    }
  },
  subscribeDataChanges(callback) {
    return subscribeCanonicalDataChanges(callback)
  },
})
