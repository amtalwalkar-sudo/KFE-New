import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { derivePerformance, layerRows, previousRange } from '../../domain/performance/performanceEngineV2.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'
import { deriveAuthoritativeBreakEven } from '../../domain/performance/authoritativeBreakEven.js'

const normalizeLoan = loan => {
  if (!loan) return null
  const startDate = loan.startDate ?? loan.start_date ?? loan.loanStartDate ?? loan.loan_start_date
  const tenureMonths = Number.isFinite(Number(loan.tenureMonths))
    ? Number(loan.tenureMonths)
    : Number.isFinite(Number(loan.tenureYears))
      ? Number(loan.tenureYears) * 12
      : Number.isFinite(Number(loan.term_months))
        ? Number(loan.term_months)
        : null
  return {
    ...loan,
    ...(startDate != null ? { startDate } : {}),
    ...(tenureMonths != null ? { tenureMonths } : {}),
    ...(loan.annualInterestRate == null && loan.annual_rate_percent != null ? { annualInterestRate: Number(loan.annual_rate_percent) } : {}),
  }
}

const normalizeCalculationSnapshot = snapshot => ({
  ...snapshot,
  loans: (snapshot?.loans?.length ? snapshot.loans : snapshot?.loan ? [snapshot.loan] : []).map(normalizeLoan).filter(Boolean),
  compliance: snapshot?.compliance?.length ? snapshot.compliance : (snapshot?.renewals || []),
})

export const PerformanceService = Object.freeze({
  async getSnapshot() {
    return PerformanceRepository.getSnapshot()
  },
  getMetrics(snapshot, range) {
    const calculationSnapshot = normalizeCalculationSnapshot(snapshot)
    const metrics = derivePerformance(calculationSnapshot, range, previousRange(range))
    const authoritativeBreakEven = deriveAuthoritativeBreakEven({
      breakEvenInputs: calculationSnapshot?.breakEvenInputs,
      range,
      loanScheduledObligation: metrics.loanScheduledObligation,
      renewalProvision: metrics.renewalProvision,
      fuelCostPerKm: metrics.fuelCostPerKm,
      vehicleKm: metrics.vehicleKm,
    })
    const breakEvenRevenue = authoritativeBreakEven.available ? authoritativeBreakEven.breakEvenRevenue : NaN
    const historicalBreakEvenForDay = ({ day }) => {
      const historicalRange = { from: day, to: new Date(day.getTime() + 86400000 - 1) }
      const historicalMetrics = derivePerformance(calculationSnapshot, historicalRange, previousRange(historicalRange))
      return Number.isFinite(historicalMetrics.breakEvenRevenue) ? historicalMetrics.breakEvenRevenue : null
    }
    const stabilization = deriveRollingDriverTarget({
      trips: calculationSnapshot?.trips,
      shifts: calculationSnapshot?.shifts,
      driverTargets: calculationSnapshot?.driverTargets,
      from: range.from,
      to: range.to,
      applicableBreakEven: breakEvenRevenue,
      historicalBreakEvenForDay,
    })
    const canonicalTarget = stabilization.available && Number.isFinite(stabilization.currentDailyTarget)
      ? stabilization.currentDailyTarget
      : null
    const targetAvailable = canonicalTarget != null
    const periodTarget = targetAvailable
      ? canonicalTarget * Math.max(1, metrics.counts.activeFinancialDays || 0)
      : NaN
    return {
      ...metrics,
      target: canonicalTarget,
      breakEvenRevenue,
      breakEvenInputs: authoritativeBreakEven.available
        ? { ...metrics.breakEvenInputs, maintenanceProvisionPerKm: authoritativeBreakEven.maintenanceProvisionPerKm, fixedCosts: authoritativeBreakEven.fixedCosts, fuelCostPerKm: authoritativeBreakEven.fuelCostPerKm }
        : { ...metrics.breakEvenInputs, available: false, reason: authoritativeBreakEven.reason },
      authority: { ...metrics.authority, target: 'AUTHORITATIVE_DRIVER_TARGET_BREAK_EVEN_PLUS_DESIRED_PROFIT_PLUS_ROLLING_BALANCE', breakEven: authoritativeBreakEven.authority || 'BREAK_EVEN_INPUTS' },
      completeness: { ...metrics.completeness, target: targetAvailable, breakEven: authoritativeBreakEven.available },
      driverTarget: canonicalTarget,
      driverTargetBase: stabilization.currentBaseDaily,
      driverTargetRecoveryAdjustment: stabilization.recoveryAdjustment,
      driverTargetRollingBalance: stabilization.balance,
      driverTargetAvailable: targetAvailable,
      pace: {
        ...metrics.pace,
        requiredRevenuePerActiveDay: canonicalTarget,
        targetGap: Number.isFinite(metrics.projectedRevenue) && Number.isFinite(periodTarget)
          ? metrics.projectedRevenue - periodTarget
          : NaN,
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
