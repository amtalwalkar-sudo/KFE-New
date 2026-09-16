import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { derivePerformance, layerRows, previousRange } from '../../domain/performance/performanceEngineV2.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'
import { normalizeCalculationSnapshot } from './normalizeCalculationSnapshot.js'
import { istMonthRange } from '../../domain/time/ist.js'

export const PerformanceService = Object.freeze({
  async getSnapshot() {
    return PerformanceRepository.getSnapshot()
  },
  subscribeDataChanges(callback) {
    return subscribeCanonicalDataChanges(callback)
  },
  getMetrics(snapshot, range) {
    const calculationSnapshot = normalizeCalculationSnapshot(snapshot)
    const metrics = derivePerformance(calculationSnapshot, range, previousRange(range))
    const monthlyBreakEvenCache = new Map()

    // The domain engine owns break-even calculation. This service helper only
    // selects the authoritative monthly result for a target month; it never
    // recalculates break-even independently.
    const authoritativeMonthlyBreakEvenForDay = ({ day }) => {
      const monthRange = istMonthRange(day)
      if (!monthRange) return null
      const key = monthRange.from.toISOString().slice(0, 7)
      if (monthlyBreakEvenCache.has(key)) return monthlyBreakEvenCache.get(key)

      const monthMetrics = derivePerformance(calculationSnapshot, monthRange, previousRange(monthRange))
      const monthlyBreakEven = Number.isFinite(monthMetrics.monthlyBreakEvenRevenue)
        ? monthMetrics.monthlyBreakEvenRevenue
        : null
      monthlyBreakEvenCache.set(key, monthlyBreakEven)
      return monthlyBreakEven
    }

    const currentDay = [...(calculationSnapshot?.trips || [])]
      .filter(x => !x?.deletedAt && !x?.deleted && x?.status === 'COMPLETED')
      .map(x => new Date(x.tripEndAt || x.tripStartAt))
      .filter(x => !Number.isNaN(x.getTime()) && x >= range.from && x <= range.to)
      .sort((a, b) => b - a)[0]

    const monthlyBreakEvenRevenue = currentDay ? authoritativeMonthlyBreakEvenForDay({ day: currentDay }) : null
    const stabilization = deriveRollingDriverTarget({
      trips: calculationSnapshot?.trips,
      shifts: calculationSnapshot?.shifts,
      driverTargets: calculationSnapshot?.driverTargets,
      from: range.from,
      to: range.to,
      applicableBreakEven: monthlyBreakEvenRevenue,
      historicalBreakEvenForDay: authoritativeMonthlyBreakEvenForDay,
      applicableBreakEvenForDay: authoritativeMonthlyBreakEvenForDay,
    })
    const canonicalTarget = stabilization.available && Number.isFinite(stabilization.currentDailyTarget)
      ? stabilization.currentDailyTarget
      : null
    const targetAvailable = canonicalTarget != null
    const dailyBreakEvenRevenue = monthlyBreakEvenRevenue != null && Number.isFinite(stabilization.remainingEligibleDays)
      ? monthlyBreakEvenRevenue / stabilization.remainingEligibleDays
      : null

    return {
      ...metrics,
      breakEvenRevenue: monthlyBreakEvenRevenue,
      target: canonicalTarget,
      monthlyBreakEvenRevenue,
      dailyBreakEvenRevenue,
      breakEvenInputs: metrics.breakEvenInputs,
      authority: {
        ...metrics.authority,
        target: 'MONTHLY_BREAK_EVEN_PLUS_MONTHLY_DESIRED_DRIVER_PROFIT_PLUS_OPENING_ROLLING_BALANCE_AMORTIZED_OVER_REMAINING_ELIGIBLE_DAYS',
        breakEven: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN',
      },
      completeness: { ...metrics.completeness, target: targetAvailable, breakEven: monthlyBreakEvenRevenue != null },
      driverTarget: canonicalTarget,
      driverTargetBase: stabilization.currentBaseDaily,
      driverTargetRecoveryAdjustment: stabilization.recoveryAdjustment,
      driverTargetRollingBalance: stabilization.balance,
      driverTargetAvailable: targetAvailable,
      driverTargetOpeningBalance: stabilization.openingBalance,
      driverTargetMonthlyVariance: stabilization.monthlyVariance,
      driverTargetClosingBalance: stabilization.closingBalance,
      driverTargetEffectiveMonthlyTarget: stabilization.effectiveMonthlyTarget,
      driverTargetRemainingEligibleDays: stabilization.remainingEligibleDays,
      driverTargetAllocatedBeforeCurrentDay: stabilization.targetAllocatedBeforeCurrentDay,
      driverTargetRemainingObligation: stabilization.remainingObligation,
      pace: {
        currentRevenuePerFinancialDay: metrics.revenuePerActiveDay,
        requiredRevenuePerFinancialDay: canonicalTarget,
        paceVariance: Number.isFinite(metrics.revenuePerActiveDay) && Number.isFinite(canonicalTarget)
          ? metrics.revenuePerActiveDay - canonicalTarget
          : NaN,
      },
    }
  },
  getLayerRows(card, layer, metrics) {
    return layerRows(card, layer, metrics)
  },
})
