import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { WorkService } from '../work/workService.js'
import { subscribeCanonicalDataChanges } from '../../repositories/canonicalDataChangeRepository.js'
import { calculateFuelPeriodSummary } from '../../domain/math/fuel.js'
import { getKfeReferenceNow, istDateKey, istDateRange, reportingRangeFor } from '../../domain/time/ist.js'
import { derivePhaseOnePerformanceOverview } from '../../domain/performance/phaseOneOverview.js'

const PERIODS = Object.freeze({ DAY: 'DAY', WEEK: 'WEEK', MONTH: 'MONTH' })
const live = records => (Array.isArray(records) ? records : []).filter(row => !row?.deletedAt && row?.deleted !== true)

/** Read-only summary of saved ride revenue and fuel observations. */
export const PhaseOnePerformanceService = Object.freeze({
  getTodayDateKey() {
    return istDateKey(getKfeReferenceNow())
  },
  subscribeDataChanges(callback) {
    return subscribeCanonicalDataChanges(callback)
  },
  async getOverview(period = 'DAY', now = getKfeReferenceNow()) {
    const isCustomRange = period && typeof period === 'object'
    const range = isCustomRange
      ? istDateRange(period.startDate, period.endDate)
      : reportingRangeFor(PERIODS[period] || PERIODS.DAY, now)
    if (!range?.from || !range?.to || range.to < range.from) throw new Error('Performance reporting period could not be resolved.')
    // Android native SQLite may contain overlay commits newer than IndexedDB.
    // Reconcile the canonical Work projection before reading the Performance snapshot.
    await WorkService.ensureCanonicalReadModel()
    const snapshot = await PerformanceRepository.getSnapshot()
    // Performance is a historical read view: the selected dates are not clipped
    // to the configured business start date. Saved records remain authoritative.
    const fuelSummary = calculateFuelPeriodSummary(live(snapshot.fuelLogs), range)
    return derivePhaseOnePerformanceOverview(snapshot, range, {
      fuelCost: fuelSummary.totalFuelAmount,
      fuelCostPerKm: fuelSummary.averageCostPerKm,
      fuelCostPerKmSource: fuelSummary.intervalCount ? 'FULL_TANK_INTERVAL' : null,
    })
  },
})
