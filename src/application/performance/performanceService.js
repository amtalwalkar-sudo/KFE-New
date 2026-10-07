import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { layerRows, previousRange } from '../../domain/performance/performanceEngineV2.js'
import { deriveFinanceAwarePerformance } from '../../domain/performance/financePerformanceAdapter.js'
import { DriverTargetService } from './driverTargetService.js'
import { normalizeCalculationSnapshot } from './normalizeCalculationSnapshot.js'
import { istMonthRange, istCalendarDaysInclusive } from '../../domain/time/ist.js'
import { deriveFinancialFactModel } from '../../domain/finance/financialFactModel.js'
import { deriveOperatingKmForecast } from '../../domain/performance/operatingKmForecast.js'
import { getPerformanceDiagnostics } from '../../domain/performance/performanceDiagnostics.js'
import { getKfeReferenceNow, reportingRangeFor } from '../../domain/time/ist.js'
import { deriveDailyTargetAchievement } from '../../domain/performance/dailyTargetAchievement.js'
import { deriveDailyRevenueAllocation } from '../../domain/performance/dailyRevenueAllocation.js'
import { getApplicableDriverTarget } from '../../domain/performance/driverTarget.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'

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
    const reportedDayRange = reportingRangeFor('DAY', asOf)
    const range = reportedDayRange
      ? { ...reportedDayRange, to: new Date(Math.min(reportedDayRange.to.getTime(), new Date(asOf).getTime())) }
      : reportedDayRange
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
    const targetMonthRange = istMonthRange(boundedRange.to)
    const targetMonthDays = targetMonthRange
      ? istCalendarDaysInclusive(targetMonthRange.from, targetMonthRange.to)
      : null
    const hasBreakEvenInput = Array.isArray(calculationSnapshot?.breakEvenInputs) && calculationSnapshot.breakEvenInputs.length > 0
    const authoritativeMonthlyBreakEven = hasBreakEvenInput && metrics.completeness?.breakEven && metrics.calculationEvidence?.breakEven?.status === 'AUTHORITATIVE' && Number.isFinite(metrics.monthlyBreakEvenRevenue)
      ? metrics.monthlyBreakEvenRevenue
      : null
    const targetRecord = getApplicableDriverTarget(calculationSnapshot?.driverTargets, boundedRange.to)
    const desiredDriverProfitMonthly = Number.isFinite(Number(targetRecord?.desiredDriverProfit))
      ? Number(targetRecord.desiredDriverProfit)
      : null
    const stabilization = deriveRollingDriverTarget({
      trips: calculationSnapshot?.trips,
      shifts: calculationSnapshot?.shifts,
      driverTargets: calculationSnapshot?.driverTargets,
      from: boundedRange.from,
      to: boundedRange.to,
      applicableBreakEven: metrics.breakEvenRevenue,
    })
    const canonicalTarget = stabilization.currentDailyTarget
    const targetAvailable = stabilization.available && Number.isFinite(Number(canonicalTarget))
    const financialDays = Number(metrics.counts?.activeFinancialDays) || 0
    const revenuePerFinancialDay = financialDays > 0 ? metrics.revenue / financialDays : NaN
    const dailyBreakEvenRevenue = authoritativeMonthlyBreakEven != null && Number.isFinite(targetMonthDays) && targetMonthDays > 0
      ? authoritativeMonthlyBreakEven / targetMonthDays
      : null

    // Daily break-even is only the authoritative monthly requirement divided
    // by calendar days in the target month. It is not an eligible-day or
    // as-of allocation.
    const today = getKfeReferenceNow()
    const todayRange = reportingRangeFor('DAY', today)
    const todayMetrics = deriveFinanceAwarePerformance(
      calculationSnapshot,
      todayRange,
      previousRange(todayRange),
    )
    const todayBreakEvenInputs = todayMetrics.breakEvenInputs || {}
    const dailyRevenueAllocation = deriveDailyRevenueAllocation({
      revenue: todayMetrics.revenue,
      monthlyBreakEvenRevenue: todayMetrics.monthlyBreakEvenRevenue,
      scheduledEmi: todayBreakEvenInputs.scheduledEmiMonthly,
      preBusinessRecovery: todayBreakEvenInputs.preBusinessRecoveryMonthly,
      maintenanceProvision: todayBreakEvenInputs.maintenanceProvisionMonthly,
      complianceProvision: todayBreakEvenInputs.complianceProvisionMonthly,
      historicalMaintenanceRecovery: todayBreakEvenInputs.historicalMaintenanceRecoveryMonthly,
    })
    const dailyBreakEvenEvidence = metrics.calculationEvidence?.breakEven || null
    const dailyBreakEvenTotal = dailyBreakEvenEvidence?.status === 'AUTHORITATIVE'
      ? dailyBreakEvenRevenue
      : null

    return {
      ...metrics,
      financialFacts,
      operatingKmForecast,
      counts: { ...metrics.counts, activeFinancialDays: financialDays },
      revenuePerActiveDay: revenuePerFinancialDay,
      revenuePerFinancialDay,
      breakEvenRevenue: authoritativeMonthlyBreakEven,
      target: canonicalTarget,
      monthlyBreakEvenRevenue: authoritativeMonthlyBreakEven,
      dailyBreakEvenRevenue,
      indicativeMonthlyBreakEvenRevenue: metrics.indicative?.monthlyBreakEvenRevenue ?? null,
      breakEvenInputs: metrics.breakEvenInputs,
      authority: {
        ...metrics.authority,
        target: 'DRIVER_TARGET_ROLLING_RECOVERY',
        breakEven: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN',
      },
      completeness: { ...metrics.completeness, target: targetAvailable, breakEven: authoritativeMonthlyBreakEven != null },
      calculationEvidence: {
        ...(metrics.calculationEvidence || {}),
        target: stabilization.available ? { status: 'AUTHORITATIVE', source: 'DRIVER_TARGET_ROLLING_RECOVERY' } : { status: 'UNAVAILABLE', reason: stabilization.reason },
        dailyBreakEven: dailyBreakEvenEvidence,
      },
      driverTarget: canonicalTarget,
      driverTargetAvailable: targetAvailable,
      driverTargetReason: stabilization.available ? null : stabilization.reason,
      driverTargetBase: stabilization.currentBaseDaily,
      driverTargetRecoveryAdjustment: stabilization.recoveryAdjustment,
      driverTargetRollingBalance: stabilization.balance,
      driverTargetEffectiveMonthlyTarget: stabilization.currentPeriodBaseTarget,
      driverTargetCalendarDaysInMonth: targetMonthDays,
      driverTargetDesiredProfitMonthly: desiredDriverProfitMonthly,
      driverTargetAuthority: 'DRIVER_TARGET_ROLLING_RECOVERY',
      dailyRevenueAllocation,
      dailyRevenueAllocationDate: today,
      dailyRevenueAllocationAuthority: 'MONTHLY_BREAK_EVEN_COMPONENTS_ALLOCATED_AS_DAILY_REVENUE_RESERVATION',
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
