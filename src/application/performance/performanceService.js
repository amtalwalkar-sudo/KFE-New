import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { layerRows, previousRange } from '../../domain/performance/performanceEngineV2.js'
import { deriveFinanceAwarePerformance } from '../../domain/performance/financePerformanceAdapter.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'
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

    const stabilization = deriveRollingDriverTarget({
      trips: calculationSnapshot?.trips,
      shifts: calculationSnapshot?.shifts,
      driverTargets: calculationSnapshot?.driverTargets,
      from: stabilizationFrom,
      to: stabilizationTo,
      applicableBreakEven: monthlyBreakEvenRevenue,
      historicalBreakEvenForDay: authoritativeMonthlyBreakEvenForDay,
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

    // Read-only daily break-even view. Fixed obligations are amortized to the
    // selected calendar day; fuel and maintenance are dynamic per live vehicle KM.
    const selectedDayRange = istMonthRange(range.to)
    const selectedDay = range.to
    const daysInSelectedMonth = selectedDayRange
      ? Math.max(1, Math.round((selectedDayRange.to - selectedDayRange.from) / 86400000) + 1)
      : 30
    const dayMetrics = deriveFinanceAwarePerformance(calculationSnapshot, {
      from: new Date(selectedDay.getTime() - 86399999),
      to: selectedDay,
    }, previousRange({ from: new Date(selectedDay.getTime() - 86399999), to: selectedDay }))
    const dailyLoan = Number.isFinite(dayMetrics.loanScheduledObligation)
      ? dayMetrics.loanScheduledObligation
      : null
    const dailyRenewal = Number.isFinite(dayMetrics.renewalProvision)
      ? dayMetrics.renewalProvision
      : null
    const dailyFuelRate = Number.isFinite(dayMetrics.fuelCostPerKm) ? dayMetrics.fuelCostPerKm : null
    const dailyMaintenanceRate = Number.isFinite(metrics.breakEvenInputs?.maintenanceProvisionPerKm)
      ? metrics.breakEvenInputs.maintenanceProvisionPerKm
      : null
    const todayVehicleKm = Number.isFinite(dayMetrics.vehicleKm) ? dayMetrics.vehicleKm : null
    const dynamicFuelToday = dailyFuelRate != null && todayVehicleKm != null ? dailyFuelRate * todayVehicleKm : null
    const dynamicMaintenanceToday = dailyMaintenanceRate != null && todayVehicleKm != null ? dailyMaintenanceRate * todayVehicleKm : null
    const dailyBreakEvenTotal = [dailyLoan, dailyRenewal, dynamicFuelToday, dynamicMaintenanceToday].every(Number.isFinite)
      ? dailyLoan + dailyRenewal + dynamicFuelToday + dynamicMaintenanceToday
      : null
    const desiredDriverProfitMonthly = Number.isFinite(stabilization.desiredDriverProfitMonthly)
      ? stabilization.desiredDriverProfitMonthly
      : null
    const desiredDriverProfitDaily = desiredDriverProfitMonthly != null
      ? desiredDriverProfitMonthly / daysInSelectedMonth
      : null
    const dailyTargetTotal = dailyBreakEvenTotal != null && desiredDriverProfitDaily != null
      ? dailyBreakEvenTotal + desiredDriverProfitDaily
      : null

    return {
      ...metrics,
      counts: { ...metrics.counts, activeFinancialDays: financialDays },
      revenuePerActiveDay: revenuePerFinancialDay,
      breakEvenRevenue: authoritativeMonthlyBreakEven,
      target: canonicalTarget,
      monthlyBreakEvenRevenue: authoritativeMonthlyBreakEven,
      dailyBreakEvenRevenue,
      breakEvenInputs: metrics.breakEvenInputs,
      authority: {
        ...metrics.authority,
        target: 'MONTHLY_BREAK_EVEN_PLUS_MONTHLY_DESIRED_DRIVER_PROFIT_PLUS_OPENING_ROLLING_BALANCE_AMORTIZED_OVER_REMAINING_ELIGIBLE_DAYS',
        breakEven: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN',
      },
      completeness: { ...metrics.completeness, target: targetAvailable, breakEven: authoritativeMonthlyBreakEven != null },
      driverTarget: canonicalTarget,
      driverTargetBase: stabilization.currentBaseDaily,
      driverTargetRecoveryAdjustment: stabilization.recoveryAdjustment,
      driverTargetRollingBalance: stabilization.balance,
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
      driverTargetDesiredProfitDaily: desiredDriverProfitDaily,
      dailyBreakEven: {
        loanScheduledObligation: dailyLoan,
        renewalProvision: dailyRenewal,
        fuelCostPerKm: dailyFuelRate,
        vehicleKm: todayVehicleKm,
        fuelCost: dynamicFuelToday,
        maintenanceProvisionPerKm: dailyMaintenanceRate,
        maintenanceProvision: dynamicMaintenanceToday,
        total: dailyBreakEvenTotal,
        daysInMonth: daysInSelectedMonth,
      },
      dailyTargetTotal,
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
})
