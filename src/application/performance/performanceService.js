import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { derivePerformance, layerRows, previousRange } from '../../domain/performance/performanceEngineV2.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'
import { normalizeCalculationSnapshot } from './normalizeCalculationSnapshot.js'
import { istMonthRange } from '../../domain/time/ist.js'

export const PerformanceService = Object.freeze({
  async getSnapshot() {
    return PerformanceRepository.getSnapshot()
  },
  getMetrics(snapshot, range) {
    const calculationSnapshot = normalizeCalculationSnapshot(snapshot)
    const metrics = derivePerformance(calculationSnapshot, range, previousRange(range))

    // There is one break-even calculation. Historical target reconstruction asks
    // the domain engine for the authoritative monthly result for that month; it
    // does not reproduce the break-even formula here.
    const monthlyBreakEvenCache = new Map()
    const monthlyBreakEvenForDay = ({ day }) => {
      const monthRange = istMonthRange(day)
      if (!monthRange) return null
      const key = monthRange.from.toISOString().slice(0, 7)
      if (monthlyBreakEvenCache.has(key)) return monthlyBreakEvenCache.get(key)
      const monthMetrics = derivePerformance(calculationSnapshot, monthRange, previousRange(monthRange))
      const monthBreakEven = Number.isFinite(monthMetrics.breakEvenRevenue) ? monthMetrics.breakEvenRevenue : null
      monthlyBreakEvenCache.set(key, monthBreakEven)
      return monthBreakEven
    }

    // A Driver Target becomes a financial-day target only after a completed trip.
    // Shifts remain an actual-economics source, but they do not manufacture a
    // target-bearing day by themselves.
    const currentDay = [...(calculationSnapshot?.trips || [])]
      .filter(x => !x?.deletedAt && x?.deleted !== true && x?.status === 'COMPLETED')
      .map(x => new Date(x.tripEndAt || x.tripStartAt))
      .filter(x => !Number.isNaN(x.getTime()) && x >= range.from && x <= range.to)
      .sort((a, b) => b - a)[0]

    const monthlyBreakEvenRevenue = currentDay ? monthlyBreakEvenForDay({ day: currentDay }) : null
    const stabilization = deriveRollingDriverTarget({
      trips: calculationSnapshot?.trips,
      shifts: calculationSnapshot?.shifts,
      driverTargets: calculationSnapshot?.driverTargets,
      from: range.from,
      to: range.to,
      applicableBreakEven: monthlyBreakEvenRevenue,
      historicalBreakEvenForDay: monthlyBreakEvenForDay,
      applicableBreakEvenForDay: monthlyBreakEvenForDay,
    })
    const canonicalTarget = stabilization.available && Number.isFinite(stabilization.currentDailyTarget)
      ? stabilization.currentDailyTarget
      : null
    const targetAvailable = canonicalTarget != null
    const effectiveMonthlyTarget = Number.isFinite(stabilization.effectiveMonthlyTarget)
      ? stabilization.effectiveMonthlyTarget
      : NaN
    const targetMonth = currentDay ? istMonthRange(currentDay) : null
    const periodCoversTargetMonth = targetMonth
      ? range.from <= targetMonth.from && range.to >= targetMonth.to
      : false
    const periodTarget = targetAvailable && periodCoversTargetMonth ? effectiveMonthlyTarget : NaN
    const dailyBreakEvenRevenue = monthlyBreakEvenRevenue != null && Number.isFinite(stabilization.remainingEligibleDays)
      ? monthlyBreakEvenRevenue / stabilization.remainingEligibleDays
      : null

    return {
      ...metrics,
      // `breakEvenRevenue` is the single monthly authority. The engine's
      // selected-period economics are not a competing break-even calculation.
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
        ...metrics.pace,
        currentRevenuePerFinancialDay: metrics.revenuePerActiveDay,
        requiredRevenuePerFinancialDay: canonicalTarget,
        paceVariance: Number.isFinite(metrics.revenuePerActiveDay) && Number.isFinite(canonicalTarget)
          ? metrics.revenuePerActiveDay - canonicalTarget
          : NaN,
        // No projection is used for Driver Target. It would mix a selected
        // reporting period with a dynamic one-day obligation and create a
        // second interpretation of target performance.
        projectedRevenue: NaN,
        targetGap: Number.isFinite(metrics.projectedRevenue) && Number.isFinite(periodTarget)
          ? metrics.projectedRevenue - periodTarget
          : NaN,
      },
    }
  },
  getLayerRows(card, layer, metrics) {
    return layerRows(card, layer, metrics)
  },
})
