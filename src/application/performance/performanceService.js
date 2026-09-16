import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { derivePerformance, layerRows, previousRange } from '../../domain/performance/performanceEngineV2.js'
import { deriveRollingDriverTarget } from '../../domain/performance/driverTargetStabilization.js'

export const PerformanceService = Object.freeze({
  async getSnapshot() {
    return PerformanceRepository.getSnapshot()
  },
  getMetrics(snapshot, range) {
    const metrics = derivePerformance(snapshot, range, previousRange(range))
    const stabilization = deriveRollingDriverTarget({
      trips: snapshot?.trips,
      driverTargets: snapshot?.driverTargets,
      from: range.from,
      to: range.to,
      applicableBreakEven: metrics.breakEvenRevenue,
    })
    const required = stabilization.currentDailyTarget
    return {
      ...metrics,
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
