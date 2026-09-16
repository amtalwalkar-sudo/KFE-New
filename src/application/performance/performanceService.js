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

const monthRangeFor = (day, asOf = new Date()) => {
  const year = day.getUTCFullYear()
  const month = day.getUTCMonth()
  const from = new Date(Date.UTC(year, month, 1))
  const monthEnd = new Date(Date.UTC(year, month + 1, 1) - 1)
  const currentMonthKey = asOf.toISOString().slice(0, 7)
  const monthKey = from.toISOString().slice(0, 7)
  const to = monthKey === currentMonthKey
    ? new Date(Math.min(monthEnd.getTime(), day.getTime()))
    : monthEnd
  return { from, to }
}

export const PerformanceService = Object.freeze({
  async getSnapshot() {
    return PerformanceRepository.getSnapshot()
  },
  getMetrics(snapshot, range) {
    const calculationSnapshot = normalizeCalculationSnapshot(snapshot)
    const metrics = derivePerformance(calculationSnapshot, range, previousRange(range))
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
      const authoritative = deriveAuthoritativeBreakEven({
        breakEvenInputs: monthSnapshot?.breakEvenInputs,
        range: monthRange,
        loanScheduledObligation: monthMetrics.loanScheduledObligation,
        renewalProvision: monthMetrics.renewalProvision,
        fuelCostPerKm: monthMetrics.fuelCostPerKm,
        vehicleKm: monthMetrics.vehicleKm,
      })
      const monthBreakEven = authoritative.available ? authoritative.breakEvenRevenue : null
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
    const periodCoversTargetMonth = currentDay
      ? range.from <= new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth(), 1)) && range.to >= new Date(Date.UTC(currentDay.getUTCFullYear(), currentDay.getUTCMonth() + 1, 0, 23, 59, 59, 999))
      : false
    const periodTarget = targetAvailable && periodCoversTargetMonth ? effectiveMonthlyTarget : NaN
    const currentRecord = currentDay ? (calculationSnapshot?.driverTargets || []).filter(x => {
      const from = x?.effectiveFrom ? new Date(x.effectiveFrom) : new Date(0)
      const until = x?.effectiveUntil ? new Date(x.effectiveUntil) : new Date('9999-12-31T23:59:59.999Z')
      return x?.active !== false && x?.status !== 'INACTIVE' && from <= currentDay && currentDay <= until
    }).sort((a, b) => String(b.effectiveFrom || '').localeCompare(String(a.effectiveFrom || '')))[0] : null
    const targetWorkingDays = currentRecord?.workingDays != null && Number(currentRecord.workingDays) > 0
      ? Number(currentRecord.workingDays)
      : null
    const dailyBreakEvenRevenue = monthlyBreakEvenRevenue != null && targetWorkingDays != null
      ? monthlyBreakEvenRevenue / targetWorkingDays
      : null

    return {
      ...metrics,
      // `breakEvenRevenue` is now the single monthly authority. The engine's
      // period-local break-even is not exposed as a competing authority here.
      breakEvenRevenue: monthlyBreakEvenRevenue,
      target: canonicalTarget,
      monthlyBreakEvenRevenue,
      dailyBreakEvenRevenue,
      breakEvenInputs: metrics.breakEvenInputs,
      authority: {
        ...metrics.authority,
        target: 'MONTHLY_BREAK_EVEN_PLUS_MONTHLY_DESIRED_DRIVER_PROFIT_DERIVED_TO_DAILY_TARGET_WITH_ROLLING_BALANCE',
        breakEven: 'AUTHORITATIVE_MONTHLY_BREAK_EVEN'
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
