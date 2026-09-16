import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { derivePerformance, layerRows, previousRange } from '../../domain/performance/performanceEngineV2.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'
import { deriveAuthoritativeBreakEven } from '../../domain/performance/authoritativeBreakEven.js'

const dateOf = v => { const x = v ? new Date(v) : null; return x && !Number.isNaN(x.getTime()) ? x : null }

export const PerformanceService = Object.freeze({
  async getSnapshot() {
    return PerformanceRepository.getSnapshot()
  },
  getMetrics(snapshot, range) {
    const metrics = derivePerformance(snapshot, range, previousRange(range))
    const authoritativeBreakEven = deriveAuthoritativeBreakEven({
      breakEvenInputs: snapshot?.breakEvenInputs,
      range,
      loanScheduledObligation: metrics.loanScheduledObligation,
      renewalProvision: metrics.renewalProvision,
      fuelCostPerKm: metrics.fuelCostPerKm,
      vehicleKm: metrics.vehicleKm,
    })
    const breakEvenRevenue = authoritativeBreakEven.available ? authoritativeBreakEven.breakEvenRevenue : NaN
    const historicalBreakEvenForDay = ({ record, day }) => {
      const recordFrom = dateOf(record?.effectiveFrom || record?.validFrom || record?.startDate)
      const recordUntil = dateOf(record?.effectiveUntil || record?.validUntil || record?.endDate)
      const historicalRange = {
        from: recordFrom && recordFrom <= day ? recordFrom : day,
        to: recordUntil && recordUntil >= day ? recordUntil : day,
      }
      const historicalMetrics = derivePerformance(snapshot, historicalRange, previousRange(historicalRange))
      return Number.isFinite(historicalMetrics.breakEvenRevenue) ? historicalMetrics.breakEvenRevenue : null
    }
    const stabilization = deriveRollingDriverTarget({
      trips: snapshot?.trips,
      shifts: snapshot?.shifts,
      driverTargets: snapshot?.driverTargets,
      from: range.from,
      to: range.to,
      applicableBreakEven: breakEvenRevenue,
      historicalBreakEvenForDay,
    })
    const required = stabilization.currentDailyTarget
    return {
      ...metrics,
      breakEvenRevenue,
      breakEvenInputs: authoritativeBreakEven.available
        ? { ...metrics.breakEvenInputs, maintenanceProvisionPerKm: authoritativeBreakEven.maintenanceProvisionPerKm, fixedCosts: authoritativeBreakEven.fixedCosts, fuelCostPerKm: authoritativeBreakEven.fuelCostPerKm }
        : { ...metrics.breakEvenInputs, available: false, reason: authoritativeBreakEven.reason },
      authority: { ...metrics.authority, breakEven: authoritativeBreakEven.authority || 'BREAK_EVEN_INPUTS' },
      completeness: { ...metrics.completeness, breakEven: authoritativeBreakEven.available },
      driverTarget: required,
      driverTargetBase: stabilization.currentBaseDaily,
      driverTargetRecoveryAdjustment: stabilization.recoveryAdjustment,
      driverTargetRollingBalance: stabilization.balance,
      driverTargetAvailable: stabilization.available,
      pace: {
        ...metrics.pace,
        requiredRevenuePerActiveDay: required,
        paceVariance: Number.isFinite(metrics.revenuePerActiveDay) && Number.isFinite(required)
          ? metrics.revenuePerActiveDay - required
          : NaN,
      },
    }
  },
  getLayerRows(card, layer, metrics) {
    return layerRows(card, layer, metrics)
  },
})
