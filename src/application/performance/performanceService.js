import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { layerRows, previousRange } from '../../domain/performance/performanceEngineV2.js'
import { deriveFinanceAwarePerformance } from '../../domain/performance/financePerformanceAdapter.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'
import { DriverTargetService } from './driverTargetService.js'
import { normalizeCalculationSnapshot } from './normalizeCalculationSnapshot.js'
import { istMonthRange } from '../../domain/time/ist.js'
import { deriveFinancialFactModel } from '../../domain/finance/financialFactModel.js'
import { deriveOperatingKmForecast } from '../../domain/performance/operatingKmForecast.js'
import { getPerformanceDiagnostics } from '../../domain/performance/performanceDiagnostics.js'
import { getKfeReferenceNow, reportingRangeFor } from '../../domain/time/ist.js'
import { deriveDailyTargetAchievement } from '../../domain/performance/dailyTargetAchievement.js'

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
  async getDailyTargetSnapshot(asOf = getKfeReferenceNow()) {
    const target = await DriverTargetService.getTarget(asOf)
    const snapshot = await PerformanceRepository.getSnapshot()
    const range = reportingRangeFor('DAY', asOf)
    const metrics = this.getMetrics(snapshot, range)
    const achieved = deriveDailyTargetAchievement({
      shifts: snapshot?.shifts,
      trips: snapshot?.trips,
      range,
      asOf,
      completedShiftRevenue: Number(metrics?.revenue || 0),
    })
    return { target, achieved }
  },
  getMetrics(snapshot, range) {
    const calculationSnapshot = normalizeCalculationSnapshot(snapshot)
    const businessStartRaw = calculationSnapshot?.businessSetup?.businessStartDate
    const businessStart = businessStartRaw
      ? (String(businessStartRaw).match(/^\d{4}-\d{2}-\d{2}$/)
          ? new Date(String(businessStartRaw) + 'T00:00:00+05:30')
          : new Date(businessStartRaw))
      : null
    const boundedRange = businessStart && !Number.isNaN(businessStart.getTime()) && range?.from
      ? { ...range, from: new Date(Math.max(new Date(range.from).getTime(), businessStart.getTime())) }
      : range
    const metrics = deriveFinanceAwarePerformance(calculationSnapshot, boundedRange, previousRange(boundedRange))
    const financialFacts = deriveFinancialFactModel({ snapshot: calculationSnapshot, metrics, range })
    const operatingKmForecast = deriveOperatingKmForecast({
      shifts: calculationSnapshot?.shifts,
      from: boundedRange.from,
      to: boundedRange.to,
      asOf: boundedRange.to,
    })
    const monthlyBreakEvenCache = new Map()
    const monthlyIndicativeProfitCache = new Map()

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

    const authoritativeIndicativeProfitForMonth = ({ month, day }) => {
      if (monthlyIndicativeProfitCache.has(month)) return monthlyIndicativeProfitCache.get(month)
      const monthRange = istMonthRange(day)
      if (!monthRange) return null
      const monthMetrics = deriveFinanceAwarePerformance(calculationSnapshot, monthRange, previousRange(monthRange))
      const value = Number.isFinite(monthMetrics.performanceHeadlineProvisionalProfit)
        ? monthMetrics.performanceHeadlineProvisionalProfit
        : null
      monthlyIndicativeProfitCache.set(month, value)
      return value
    }

    const targetMonthRange = istMonthRange(boundedRange.to)
    const stabilizationFrom = targetMonthRange?.from || boundedRange.from
    const stabilizationTo = targetMonthRange
      ? new Date(Math.min(targetMonthRange.to.getTime(), boundedRange.to.getTime()))
      : boundedRange.to

    const monthlyBreakEvenRevenue = Number.isFinite(metrics.monthlyBreakEvenRevenue)
      ? metrics.monthlyBreakEvenRevenue
      : null

    const stabilization = deriveRollingDriverTarget({
      trips: calculationSnapshot?.trips,
      shifts: calculationSnapshot?.shifts,
      driverTargets: calculationSnapshot?.driverTargets,
      from: stabilizationFrom,
      to: stabilizationTo,
      applicableBreakEven: monthlyBreakEvenRevenue,
      historicalBreakEvenForDay: authoritativeMonthlyBreakEvenForDay,
      operatingKmForecast,
      historicalIndicativeProfitForMonth: authoritativeIndicativeProfitForMonth,
      indicativeProfitForCurrentMonth: ({ month }) => {
        if (monthlyIndicativeProfitCache.has(month)) return monthlyIndicativeProfitCache.get(month)
        const monthRange = istMonthRange(stabilizationTo)
        if (!monthRange) return null
        const asOfMonthRange = { ...monthRange, to: stabilizationTo }
        const monthMetrics = deriveFinanceAwarePerformance(calculationSnapshot, asOfMonthRange, previousRange(asOfMonthRange))
        const value = Number.isFinite(monthMetrics.performanceHeadlineProvisionalProfit)
          ? monthMetrics.performanceHeadlineProvisionalProfit
          : null
        monthlyIndicativeProfitCache.set(month, value)
        return value
      },
    })
    // Target authority is deliberately simple: the authoritative monthly
    // break-even plus the Admin-entered monthly driver profit, allocated
    // evenly across every calendar day in the target month. Do not let the
    // stabilization helper substitute an as-of/eligible-day break-even here.
    const authoritativeMonthlyBreakEven = monthlyBreakEvenRevenue
    const targetMonthDays = targetMonthRange
      ? Math.round((targetMonthRange.to.getTime() - targetMonthRange.from.getTime()) / 86400000) + 1
      : null
    const dailyBreakEvenRevenue = authoritativeMonthlyBreakEven != null && Number.isFinite(targetMonthDays) && targetMonthDays > 0
      ? authoritativeMonthlyBreakEven / targetMonthDays
      : null
    const desiredDriverProfitForTarget = Number.isFinite(stabilization.desiredDriverProfitMonthly)
      ? stabilization.desiredDriverProfitMonthly
      : null
    const targetMonthlyRequirement = dailyBreakEvenRevenue != null && desiredDriverProfitForTarget != null
      ? (authoritativeMonthlyBreakEven + desiredDriverProfitForTarget)
      : null
    const canonicalTarget = targetMonthlyRequirement != null && Number.isFinite(targetMonthDays) && targetMonthDays > 0
      ? targetMonthlyRequirement / targetMonthDays
      : null
    const targetAvailable = canonicalTarget != null
    const financialDays = Number.isFinite(stabilization.financialDays) ? stabilization.financialDays : 0
    const revenuePerFinancialDay = financialDays > 0 ? metrics.revenue / financialDays : NaN

    // Daily break-even is only the authoritative monthly requirement divided
    // by calendar days in the target month. It is not an eligible-day or
    // as-of allocation.
    const dailyBreakEvenEvidence = metrics.calculationEvidence?.breakEven || null
    const dailyBreakEvenTotal = dailyBreakEvenEvidence?.status === 'AUTHORITATIVE'
      ? dailyBreakEvenRevenue
      : null
    const desiredDriverProfitMonthly = Number.isFinite(stabilization.desiredDriverProfitMonthly)
      ? stabilization.desiredDriverProfitMonthly
      : null

    return {
      ...metrics,
      financialFacts,
      operatingKmForecast,
      counts: { ...metrics.counts, activeFinancialDays: financialDays },
      revenuePerActiveDay: revenuePerFinancialDay,
      breakEvenRevenue: authoritativeMonthlyBreakEven,
      target: canonicalTarget,
      monthlyBreakEvenRevenue: authoritativeMonthlyBreakEven,
      dailyBreakEvenRevenue,
      indicativeMonthlyBreakEvenRevenue: metrics.indicative?.monthlyBreakEvenRevenue ?? null,
      breakEvenInputs: metrics.breakEvenInputs,
      authority: {
        ...metrics.authority,
        target: 'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT',
        breakEven: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN',
      },
      completeness: { ...metrics.completeness, target: targetAvailable, breakEven: authoritativeMonthlyBreakEven != null },
      calculationEvidence: {
        ...(metrics.calculationEvidence || {}),
        target: stabilization.evidence || null,
        dailyBreakEven: dailyBreakEvenEvidence,
      },
      driverTarget: canonicalTarget,
      driverTargetBase: dailyBreakEvenRevenue,
      driverTargetAvailable: targetAvailable,
      driverTargetReason: stabilization.reason,
      driverTargetEffectiveMonthlyTarget: targetMonthlyRequirement,
      driverTargetRemainingEligibleDays: targetMonthDays,
      driverTargetDesiredProfitMonthly: desiredDriverProfitMonthly,
      dailyBreakEven: {
        status: dailyBreakEvenEvidence?.status || 'UNAVAILABLE',
        source: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN_ALLOCATED_OVER_CALENDAR_DAYS',
        reason: dailyBreakEvenEvidence?.reason || null,
        monthlyBreakEvenRevenue: authoritativeMonthlyBreakEven,
        calendarDaysInMonth: targetMonthDays,
        total: dailyBreakEvenTotal,
      },
      pace: {
        currentRevenuePerFinancialDay: revenuePerFinancialDay,
        requiredRevenuePerFinancialDay: canonicalTarget,
        paceVariance: Number.isFinite(revenuePerFinancialDay) && Number.isFinite(canonicalTarget)
          ? revenuePerFinancialDay - canonicalTarget
          : NaN,
      },
    }
  },
  getLayerRows(card, layer, metrics) {
    return layerRows(card, layer, metrics)
  },
  getDiagnostics(metrics) {
    return getPerformanceDiagnostics(metrics)
  },
})
