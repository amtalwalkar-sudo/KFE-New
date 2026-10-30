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
    const asOf = new Date(now)
    // Loan and maintenance balances are derived as-of `to` from their complete
    // canonical histories; the range start controls period metrics only. Keep it
    // bounded to the selected period so a long loan history cannot force decades
    // of unrelated daily performance calculations just to display a balance.
    const balanceFrom = range.from <= asOf ? range.from : asOf
    const balanceMetrics = PerformanceService.getMetrics(snapshot, { from: balanceFrom, to: asOf })
    return {
      ...derivePhaseOnePerformanceOverview(snapshot, range, metrics),
      // Cumulative signed buckets as of now; do not subtract these again from Phase 1 income-after-fuel.
      provisionBalances: {
        asOf: asOf.toISOString(),
        emi: {
          available: balanceMetrics.completeness?.loan === true && Number.isFinite(balanceMetrics.loanProvisionBalance),
          balance: balanceMetrics.loanProvisionBalance,
        },
        maintenance: {
          available: balanceMetrics.maintenanceProvisionEvidenceStatus === 'AUTHORITATIVE' && Number.isFinite(balanceMetrics.maintenanceProvisionBalance),
          balance: balanceMetrics.maintenanceProvisionBalance,
        },
      },
    }
  },
  subscribeDataChanges(callback) {
    return PerformanceService.subscribeDataChanges(callback)
  },
})
