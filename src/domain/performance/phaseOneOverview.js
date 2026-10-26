const live = records => (Array.isArray(records) ? records : []).filter(record => !record?.deletedAt && record?.deleted !== true)
const time = value => {
  if (value == null || value === '') return null
  const result = new Date(value).getTime()
  return Number.isFinite(result) ? result : null
}
const amount = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0
const inRange = (value, range) => {
  const at = time(value)
  return at != null && at >= range.from.getTime() && at <= range.to.getTime()
}

/**
 * Phase 1 Performance summary. The existing PerformanceService remains the
 * authority for shift revenue and fuel economics; this projection only splits
 * cancellation fees out for display and computes the requested net-after-fuel
 * figure. It never writes or repairs operational records.
 */
export function derivePhaseOnePerformanceOverview(snapshot, range, metrics) {
  if (!range?.from || !range?.to || range.to < range.from) throw new Error('Performance reporting period is invalid.')
  const shifts = live(snapshot?.shifts).filter(shift => inRange(shift.shiftEndAt || shift.shiftStartAt, range))
  const shiftIds = new Set(shifts.map(shift => shift.id).filter(Boolean))
  const trips = live(snapshot?.trips)
  const completedRides = trips.filter(trip => trip.status === 'COMPLETED' && inRange(trip.tripEndAt || trip.tripStartAt, range)).length
  const cancellationFees = trips
    .filter(trip => trip.status === 'CANCELLED' && (!trip.shiftId || shiftIds.has(trip.shiftId)))
    .filter(trip => inRange(trip.tripEndAt || trip.cancelledAt || trip.tripStartAt || trip.createdAt, range))
    .reduce((sum, trip) => sum + amount(trip.cancelledRevenue ?? trip.revenue), 0)
  const recordedRevenue = Number.isFinite(Number(metrics?.revenue)) ? Number(metrics.revenue) : 0
  const fuelSpending = Number.isFinite(Number(metrics?.fuelCost)) ? Number(metrics.fuelCost) : 0
  const fuelCostPerKm = Number.isFinite(Number(metrics?.fuelCostPerKm)) ? Number(metrics.fuelCostPerKm) : null
  return {
    completedRides,
    cancellationFees,
    recordedRevenue,
    fareIncome: recordedRevenue - cancellationFees,
    fuelSpending,
    fuelCostPerKm,
    fuelCostPerKmSource: metrics?.breakEvenInputs?.fuelCostPerKmSource || null,
    incomeAfterFuel: recordedRevenue - fuelSpending,
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    revenueAuthority: metrics?.authority?.revenue || 'SHIFT_END_REVENUE',
  }
}
