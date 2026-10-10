import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { deriveFinanceAwarePerformance } from '../../domain/performance/financePerformanceAdapter.js'
import { resolveDriverTargetAuthority, getApplicableDriverTarget } from '../../domain/performance/driverTarget.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'
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
      : Number.isFinite(metrics.indicative?.monthlyBreakEvenRevenue)
        ? metrics.indicative.monthlyBreakEvenRevenue
        : null
    const targetRecord = getApplicableDriverTarget(snapshot?.driverTargets, targetTo)
    const desiredValue = targetRecord?.desiredDriverProfit
    const desiredDriverProfitMonthly = desiredValue != null && desiredValue !== '' && Number.isFinite(Number(desiredValue))
      ? Number(desiredValue)
      : null
    const calendarDays = istCalendarDaysInclusive(monthRange.from, monthRange.to)
    const breakEvenStatus = metrics.calculationEvidence?.breakEven?.status || 'UNAVAILABLE'
    const rolling = deriveRollingDriverTarget({
      trips: snapshot?.trips,
      shifts: snapshot?.shifts,
      driverTargets: snapshot?.driverTargets,
      from: monthRange.from,
      to: targetTo,
      applicableBreakEven: monthlyBreakEvenRevenue,
    })
    const formula = resolveDriverTargetAuthority({
      monthlyBreakEvenRevenue,
      desiredDriverProfitMonthly,
      calendarDays,
      rollingTarget: rolling,
      breakEvenStatus,
    })

    const targetStatus = formula.status
    return {
      ...formula,
      status: targetStatus,
      provisional: targetStatus === 'INDICATIVE',
      target: formula.available ? formula.target : null,
      monthlyBreakEvenRevenue,
      desiredDriverProfitMonthly,
      calendarDays,
    }
  },
  subscribeDataChanges(callback) {
    return subscribeCanonicalDataChanges(callback)
  },
})
