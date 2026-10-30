import { PerformanceRepository } from '../../repositories/performanceRepository.js'
import { calculateFuelPeriodSummary } from '../../domain/math/fuel.js'
import { getKfeReferenceNow, reportingRangeFor } from '../../domain/time/ist.js'
import { derivePhaseOnePerformanceOverview } from '../../domain/performance/phaseOneOverview.js'

const PERIODS = Object.freeze({ DAY: 'DAY', WEEK: 'WEEK', MONTH: 'MONTH' })
const live = records => (Array.isArray(records) ? records : []).filter(row => !row?.deletedAt && row?.deleted !== true)
const at = value => { const result = value == null || value === '' ? NaN : new Date(value).getTime(); return Number.isFinite(result) ? result : null }
const inRange = (value, range) => { const time = at(value); return time != null && time >= range.from.getTime() && time <= range.to.getTime() }
const amount = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0

/**
 * Basic read-only Performance: recorded shift revenue, completed rides,
 * cancellation fees and recorded fuel only. No targets, forecasts, provisions,
 * loan amortization, break-even model, or maintenance projections.
 */
export const PhaseOnePerformanceService = Object.freeze({
  async getOverview(period = 'DAY', now = getKfeReferenceNow()) {
    const selectedPeriod = PERIODS[period] || PERIODS.DAY
    const range = reportingRangeFor(selectedPeriod, now)
    if (!range?.from || !range?.to || range.to < range.from) throw new Error('Performance reporting period could not be resolved.')
    const snapshot = await PerformanceRepository.getSnapshot()
    const shifts = live(snapshot.shifts).filter(shift => inRange(shift.shiftEndAt || shift.shiftStartAt, range))
    const shiftIds = new Set(shifts.map(shift => shift.id).filter(Boolean))
    const trips = live(snapshot.trips)
    const cancellationFees = trips
      .filter(trip => trip.status === 'CANCELLED' && (trip.shiftId ? shiftIds.has(trip.shiftId) : inRange(trip.tripEndAt || trip.cancelledAt || trip.tripStartAt || trip.createdAt, range)))
      .reduce((sum, trip) => sum + amount(trip.cancelledRevenue ?? trip.revenue), 0)
    const completedRides = trips.filter(trip => trip.status === 'COMPLETED' && inRange(trip.tripEndAt || trip.tripStartAt, range)).length
    const recordedRevenue = shifts.reduce((sum, shift) => sum + amount(shift.revenue), 0)
    const fuelLogs = live(snapshot.fuelLogs)
    const fuelSummary = calculateFuelPeriodSummary(fuelLogs, range)
    const metrics = {
      revenue: recordedRevenue,
      fuelCost: fuelSummary.totalFuelAmount,
      fuelCostPerKm: fuelSummary.averageCostPerKm,
      breakEvenInputs: { fuelCostPerKmSource: fuelSummary.intervalCount ? 'FULL_TANK_INTERVAL' : null },
      authority: { revenue: 'SAVED_SHIFT_REVENUE' },
    }
    return {
      ...derivePhaseOnePerformanceOverview({ ...snapshot, shifts, trips }, range, metrics),
      completedRides,
      cancellationFees,
      recordedRevenue,
      fareIncome: recordedRevenue - cancellationFees,
      fuelSpending: fuelSummary.totalFuelAmount,
      fuelCostPerKm: fuelSummary.averageCostPerKm,
      fuelCostPerKmSource: fuelSummary.intervalCount ? 'FULL_TANK_INTERVAL' : null,
      incomeAfterFuel: recordedRevenue - fuelSummary.totalFuelAmount,
    }
  },
})
