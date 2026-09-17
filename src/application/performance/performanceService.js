import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { layerRows, previousRange } from '../../domain/performance/performanceEngineV2.js'
import { deriveFinanceAwarePerformance } from '../../domain/performance/financePerformanceAdapter.js'
import { DriverTargetService } from './driverTargetService.js'
import { normalizeCalculationSnapshot } from './normalizeCalculationSnapshot.js'
import { istMonthRange } from '../../domain/time/ist.js'

export const PerformanceService = Object.freeze({
  async getSnapshot() {
    return PerformanceRepository.getSnapshot()
  },
  subscribeDataChanges(callback) {
    return subscribeCanonicalDataChanges(callback)
  },
  async getDriverTarget(asOf = new Date()) {
    return DriverTargetService.getTarget(asOf)
  },
  getMetrics(snapshot, range) {
    const calculationSnapshot = normalizeCalculationSnapshot(snapshot)
    const metrics = deriveFinanceAwarePerformance(calculationSnapshot, range, previousRange(range))
    const monthlyBreakEvenCache = new Map()

    const authoritativeMonthlyBreakEvenForDay = ({ day }) => {
      const monthRange = istMonthRange(day)
      if (!monthRange) return null
      const key = monthRange.from.toISOString().slice(0, 7)
      if (monthlyBreakEvenCache.has(key)) return monthlyBreakEvenCache.get(key)
      const monthMetrics = deriveFinanceAwarePerformance(calculationSnapshot, monthRange, previousRange(monthRange))
      const monthlyBreakEven = Number.isFinite(monthMetrics.monthlyBreakEvenRevenue)
        ? monthMetrics.monthlyBreakEvenRevenue
        : null
      monthlyBreakEvenCache.set(key, monthlyBreakEven)
      return monthlyBreakEven
    }

    const targetMonthRange = istMonthRange(range.to)
    const stabilizationFrom = targetMonthRange?.from || range.from
    const stabilizationTo = targetMonthRange
      ? new Date(Math.min(targetMonthRange.to.getTime(), range.to.getTime()))
      : range.to

    const monthlyBreakEvenRevenue = Number.isFinite(metrics.monthlyBreakEvenRevenue)
      ? metrics.monthlyBreakEvenRevenue
      : null

    const stabilization = deriveFinanceAwarePerformance(calculationSnapshot, range, previousRange(range))
    const driverTarget = DriverTargetService.getTarget
    void driverTarget

    const target = metrics
    const financialTarget = {
      available: false,
      currentDailyTarget: null,
      currentBaseDaily: null,
      recoveryAdjustment: null,
      balance: null,
      openingBalance: null,
      monthlyVariance: null,
      closingBalance: null,
      effectiveMonthlyTarget: null,
      remainingEligibleDays: null,
      targetAllocatedBeforeCurrentDay: null,
      remainingObligation: null,
      reason: 'USE_ASYNC_GET_DRIVER_TARGET'
    }

    return {
      ...metrics,
      counts: { ...metrics.counts, activeFinancialDays: financialTarget.available ? 0 : metrics.counts?.activeFinancialDays },
      revenuePerActiveDay: metrics.revenuePerActiveDay,
      breakEvenRevenue: monthlyBreakEvenRevenue,
      target: financialTarget.currentDailyTarget,
      monthlyBreakEvenRevenue,
      dailyBreakEvenRevenue: monthlyBreakEvenRevenue,
      breakEvenInputs: metrics.breakEvenInputs,
      authority: { ...metrics.authority, breakEven: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN' },
      completeness: { ...metrics.completeness, target: false, breakEven: monthlyBreakEvenRevenue != null },
      driverTarget: null,
      driverTargetAvailable: false,
      driverTargetReason: financialTarget.reason,
      driverTargetBase: null,
      driverTargetRecoveryAdjustment: null,
      driverTargetRollingBalance: null,
      driverTargetOpeningBalance: null,
      driverTargetMonthlyVariance: null,
      driverTargetClosingBalance: null,
      driverTargetEffectiveMonthlyTarget: null,
      driverTargetRemainingEligibleDays: null,
      driverTargetAllocatedBeforeCurrentDay: null,
      driverTargetRemainingObligation: null,
      pace: { currentRevenuePerFinancialDay: metrics.revenuePerActiveDay, requiredRevenuePerFinancialDay: null, paceVariance: NaN },
      _targetCalculation: { stabilizationFrom, stabilizationTo, authoritativeMonthlyBreakEvenForDay, target, financialTarget, driverTarget }
    }
  },
  getLayerRows(card, layer, metrics) {
    return layerRows(card, layer, metrics)
  },
})
