import { PerformanceService } from './performanceService.js'
import { getKfeReferenceNow, reportingRangeFor } from '../../domain/time/ist.js'
import { derivePhaseOnePerformanceOverview } from '../../domain/performance/phaseOneOverview.js'

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
    return derivePhaseOnePerformanceOverview(snapshot, range, metrics)
  },
  subscribeDataChanges(callback) {
    return PerformanceService.subscribeDataChanges(callback)
  },
})
