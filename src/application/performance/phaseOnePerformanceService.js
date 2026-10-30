import { PerformanceService } from './performanceService.js'
import { getKfeReferenceNow, reportingRangeFor } from '../../domain/time/ist.js'
import { derivePhaseOnePerformanceOverview } from '../../domain/performance/phaseOneOverview.js'
import { deriveCumulativeProvisionBalances } from '../../domain/performance/financePerformanceAdapter.js'

const PERIODS = Object.freeze({ DAY: 'DAY', WEEK: 'WEEK', MONTH: 'MONTH' })

export const PhaseOnePerformanceService = Object.freeze({
  async getOverview(period = 'DAY', now = getKfeReferenceNow()) {
    const selectedPeriod = PERIODS[period] || PERIODS.DAY
    const range = reportingRangeFor(selectedPeriod, now)
    if (!range?.from || !range?.to || range.to < range.from) {
      throw new Error('Performance reporting period could not be resolved.')
    }
    const snapshot = await PerformanceService.getSnapshot()
    const metrics = PerformanceService.getMetrics(snapshot, range)
    const asOf = new Date(now)
    // Cumulative balances use a focused as-of domain read model. Do not derive
    // them from selected-period metrics: doing so silently resets balances when
    // the driver changes Today / This week / This month.
    const provisionBalances = deriveCumulativeProvisionBalances(snapshot, asOf)
    return {
      ...derivePhaseOnePerformanceOverview(snapshot, range, metrics),
      // Cumulative signed buckets as of now; do not subtract these again from Phase 1 income-after-fuel.
      provisionBalances,
    }
  },
  subscribeDataChanges(callback) {
    return PerformanceService.subscribeDataChanges(callback)
  },
})
