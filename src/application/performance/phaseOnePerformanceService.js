import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { calculateFuelPeriodSummary } from '../../domain/math/fuel.js'
import { getKfeReferenceNow, reportingRangeFor } from '../../domain/time/ist.js'
import { derivePhaseOnePerformanceOverview } from '../../domain/performance/phaseOneOverview.js'

const PERIODS = Object.freeze({ DAY: 'DAY', WEEK: 'WEEK', MONTH: 'MONTH' })
const live = records => (Array.isArray(records) ? records : []).filter(row => !row?.deletedAt && row?.deleted !== true)

/** Read-only summary of saved ride revenue and fuel observations. */
export const PhaseOnePerformanceService = Object.freeze({
  async getOverview(period = 'DAY', now = getKfeReferenceNow()) {
    const selectedPeriod = PERIODS[period] || PERIODS.DAY
    const range = reportingRangeFor(selectedPeriod, now)
    if (!range?.from || !range?.to || range.to < range.from) throw new Error('Performance reporting period could not be resolved.')
    const snapshot = await PerformanceRepository.getSnapshot()
    const fuelSummary = calculateFuelPeriodSummary(live(snapshot.fuelLogs), range)
    return derivePhaseOnePerformanceOverview(snapshot, range, {
      fuelCost: fuelSummary.totalFuelAmount,
      fuelCostPerKm: fuelSummary.averageCostPerKm,
      fuelCostPerKmSource: fuelSummary.intervalCount ? 'FULL_TANK_INTERVAL' : null,
      authority: { revenue: 'SAVED_SHIFT_REVENUE' },
    })
  },
})
