import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { derivePerformance, layerRows, previousRange } from '../../domain/performance/performanceEngineV2.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'
import { deriveAuthoritativeBreakEven } from '../../domain/performance/authoritativeBreakEven.js'

const normalizeLoan = loan => {
  if (!loan) return null
  const startDate = loan.startDate ?? loan.start_date ?? loan.loanStartDate ?? loan.loan_start_date
  const hasNumber = value => value != null && value !== '' && Number.isFinite(Number(value))
  const tenureMonths = hasNumber(loan.tenureMonths)
    ? Number(loan.tenureMonths)
    : hasNumber(loan.tenureYears)
      ? Number(loan.tenureYears) * 12
      : hasNumber(loan.term_months)
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

const monthRangeFor = day => {
  const year = day.getUTCFullYear()
  const month = day.getUTCMonth()
  return { from: new Date(Date.UTC(year, month, 1)), to: new Date(Date.UTC(year, month + 1, 1) - 1) }
}

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
    const monthlyBreakEvenCache = new Map()
    const monthlyBreakEvenForDay = ({ day }) => {
      const monthRange = monthRangeFor(day)
      const key = monthRange.from.toISOString().slice(0, 7)
      if (monthlyBreakEvenCache.has(key)) return monthlyBreakEvenCache.get(key)
      const monthSnapshot = {
        ...calculationSnapshot,
        fuelLogs: (calculationSnapshot?.fuelLogs || []).filter(x => {
          const capturedAt = x?.capturedAt || x?.createdAt
          const capturedDate = capturedAt ? new Date(capturedAt) : null
          return capturedDate && !Number.isNaN(capturedDate.getTime()) && capturedDate <= monthRange.to
        }),
      }
      const monthMetrics = derivePerformance(monthSnapshot, monthRange, previousRange(monthRange))
      const monthBreakEven = Number.isFinite(monthMetrics.breakEvenRevenue) ? monthMetrics.breakEvenRevenue : null
      monthlyBreakEvenCache.set(key, monthBreakEven)
      return monthBreakEven
    }
    const currentDay = [...(calculationSnapshot?.shifts || [])]
      .filter(x => !x?.deletedAt && x?.deleted !== true)
      .map(x => new Date(x.shiftEndAt || x.shiftStartAt))
      .filter(x => !Number.isNaN(x.getTime()) && x >= range.from && x <= range.to)
      .sort((a, b) => b - a)[0]
    const monthlyBreakEvenRevenue = currentDay ? monthlyBreakEvenForDay({ day: currentDay }) : null
    const stabilization = deriveRollingDriverTarget({
      trips: calculationSnapshot?.trips,
      shifts: calculationSnapshot?.shifts,
      driverTargets: calculationSnapshot?.driverTargets,
      from: range.from,
      to: range.to,
      // Driver-target stabilization consumes the authoritative MONTHLY break-even.
      // breakEvenRevenue is the period calculation figure and must not be treated as monthly.
      applicableBreakEven: monthlyBreakEvenRevenue,
      historicalBreakEvenForDay: monthlyBreakEvenForDay,
    })
    const canonicalTarget = stabilization.available && Number.isFinite(stabilization.currentDailyTarget)
      ? stabilization.currentDailyTarget
      : null
    const targetAvailable = canonicalTarget != null
    const targetActiveDays = stabilization.activeDays || 0
    const periodTarget = targetAvailable
      ? canonicalTarget * Math.max(1, targetActiveDays)
      : NaN
    const currentRecord = currentDay ? (calculationSnapshot?.driverTargets || []).filter(x => {
      const from = x?.effectiveFrom ? new Date(x.effectiveFrom) : new Date(0)
      const until = x?.effectiveUntil ? new Date(x.effectiveUntil) : new Date('9999-12-31T23:59:59.999Z')
      return x?.active !== false && x?.status !== 'INACTIVE' && from <= currentDay && currentDay <= until
    }).sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')))[0] : null
    const targetWorkingDays = currentRecord?.workingDays != null && Number(currentRecord.workingDays) > 0 ? Number(currentRecord.workingDays) : null
    const dailyBreakEvenRevenue = monthlyBreakEvenRevenue != null && targetWorkingDays != null ? monthlyBreakEvenRevenue / targetWorkingDays : null
    return {
      ...metrics,
      target: canonicalTarget,
      breakEvenRevenue,
      monthlyBreakEvenRevenue,
      dailyBreakEvenRevenue,
      breakEvenInputs: authoritativeBreakEven.available
        ? { ...metrics.breakEvenInputs, maintenanceProvisionPerKm: authoritativeBreakEven.maintenanceProvisionPerKm, fixedCosts: authoritativeBreakEven.fixedCosts, fuelCostPerKm: authoritativeBreakEven.fuelCostPerKm }
        : { ...metrics.breakEvenInputs, available: false, reason: authoritativeBreakEven.reason },
      authority: { ...metrics.authority, target: 'MONTHLY_BREAK_EVEN_PLUS_MONTHLY_DESIRED_DRIVER_PROFIT_DERIVED_TO_DAILY_TARGET_WITH_ROLLING_BALANCE', breakEven: authoritativeBreakEven.authority || 'BREAK_EVEN_INPUTS' },
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
