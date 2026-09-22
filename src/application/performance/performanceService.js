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
    const financialFacts = deriveFinancialFactModel({ snapshot: calculationSnapshot, metrics, range })
    const operatingKmForecast = deriveOperatingKmForecast({
      shifts: calculationSnapshot?.shifts,
      from: range.from,
      to: range.to,
      asOf: range.to,
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
      const monthStart = monthRange.from
      const priorEnd = new Date(monthStart.getTime() - 1)
      const priorRange = { from: priorEnd, to: priorEnd }
      const priorMetrics = deriveFinanceAwarePerformance(calculationSnapshot, priorRange, previousRange(priorRange))
      const loanProvision = Number(monthMetrics.loanProvisionAccumulated) - Number(priorMetrics.loanProvisionAccumulated)
      const maintenanceProvision = Number(monthMetrics.maintenanceProvision)
      const renewalProvision = Number(monthMetrics.renewalProvision)
      const provision = loanProvision + maintenanceProvision + renewalProvision
      const value = Number.isFinite(monthMetrics.revenue) && Number.isFinite(provision)
        ? monthMetrics.revenue - provision
        : null
      monthlyIndicativeProfitCache.set(month, value)
      return value
    }

    const targetMonthRange = istMonthRange(range.to)
    const stabilizationFrom = targetMonthRange?.from || range.from
    const stabilizationTo = targetMonthRange
      ? new Date(Math.min(targetMonthRange.to.getTime(), range.to.getTime()))
      : range.to

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
        const monthStart = asOfMonthRange.from
        const priorEnd = new Date(monthStart.getTime() - 1)
        const priorRange = { from: priorEnd, to: priorEnd }
        const priorMetrics = deriveFinanceAwarePerformance(calculationSnapshot, priorRange, previousRange(priorRange))
        const loanProvision = Number(monthMetrics.loanProvisionAccumulated) - Number(priorMetrics.loanProvisionAccumulated)
        const provision = loanProvision + Number(monthMetrics.maintenanceProvision) + Number(monthMetrics.renewalProvision)
        const value = Number.isFinite(monthMetrics.revenue) && Number.isFinite(provision)
          ? monthMetrics.revenue - provision
          : null
        monthlyIndicativeProfitCache.set(month, value)
        return value
      },
    })
    const canonicalTarget = stabilization.available && Number.isFinite(stabilization.currentDailyTarget)
      ? stabilization.currentDailyTarget
      : null
    const targetAvailable = canonicalTarget != null
    const authoritativeMonthlyBreakEven = Number.isFinite(stabilization.monthlyBreakEvenRevenue)
      ? stabilization.monthlyBreakEvenRevenue
      : monthlyBreakEvenRevenue
    const dailyBreakEvenRevenue = authoritativeMonthlyBreakEven != null && Number.isFinite(stabilization.remainingEligibleDays)
      ? authoritativeMonthlyBreakEven / stabilization.remainingEligibleDays
      : null
    const financialDays = Number.isFinite(stabilization.financialDays) ? stabilization.financialDays : 0
    const revenuePerFinancialDay = financialDays > 0 ? metrics.revenue / financialDays : NaN

    // Daily break-even is a representation of the authoritative monthly
    // requirement, not a second cost-build formula. It is allocated over the
    // same remaining eligible financial days used by the target authority.
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
        target: 'MONTHLY_BREAK_EVEN_PLUS_MONTHLY_DESIRED_DRIVER_PROFIT_PLUS_FINALIZED_PRIOR_LOSS_RECOVERY_WITH_CALENDAR_DAY_RECOVERY',
        breakEven: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN',
      },
      completeness: { ...metrics.completeness, target: targetAvailable, breakEven: authoritativeMonthlyBreakEven != null },
      calculationEvidence: {
        ...(metrics.calculationEvidence || {}),
        target: stabilization.evidence || null,
        dailyBreakEven: dailyBreakEvenEvidence,
      },
      driverTarget: canonicalTarget,
      driverTargetBase: stabilization.currentBaseDaily,
      driverTargetOperatingKmForecast: stabilization.operatingKmForecastDaily,
      driverTargetOperatingKmMultiplier: stabilization.operatingKmMultiplier,
      driverTargetRecoveryAdjustment: stabilization.recoveryAdjustment,
      driverTargetRollingBalance: stabilization.balance,
      driverTargetOpeningRecovery: stabilization.openingRecovery,
      driverTargetNewRecovery: stabilization.newRecovery,
      driverTargetRecoveryAllocated: stabilization.recoveryAllocated,
      driverTargetRecoveryAchieved: stabilization.recoveryAchieved,
      driverTargetClosingRecovery: stabilization.closingRecovery,
      driverTargetIndicativeProfit: stabilization.indicativeProfit,
      driverTargetIndicativeLoss: stabilization.indicativeLoss,
      driverTargetDailyRecovery: stabilization.dailyRecovery,
      driverTargetAvailable: targetAvailable,
      driverTargetReason: stabilization.reason,
      driverTargetOpeningBalance: stabilization.openingBalance,
      driverTargetMonthlyVariance: stabilization.monthlyVariance,
      driverTargetClosingBalance: stabilization.closingBalance,
      driverTargetEffectiveMonthlyTarget: stabilization.effectiveMonthlyTarget,
      driverTargetRemainingEligibleDays: stabilization.remainingEligibleDays,
      driverTargetAllocatedBeforeCurrentDay: stabilization.targetAllocatedBeforeCurrentDay,
      driverTargetRemainingObligation: stabilization.remainingObligation,
      driverTargetDesiredProfitMonthly: desiredDriverProfitMonthly,
      dailyBreakEven: {
        status: dailyBreakEvenEvidence?.status || 'UNAVAILABLE',
        source: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN_ALLOCATED_OVER_REMAINING_ELIGIBLE_DAYS',
        reason: dailyBreakEvenEvidence?.reason || null,
        monthlyBreakEvenRevenue: authoritativeMonthlyBreakEven,
        remainingEligibleDays: stabilization.remainingEligibleDays,
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
