import assert from 'node:assert/strict'
import { derivePhaseOnePerformanceOverview } from '../domain/performance/phaseOneOverview.js'

const range = { from: new Date('2026-10-26T00:00:00+05:30'), to: new Date('2026-10-26T23:59:59.999+05:30') }
const snapshot = {
  shifts: [
    { id: 'today', shiftStartAt: '2026-10-26T08:00:00+05:30', shiftEndAt: '2026-10-26T18:00:00+05:30', revenue: 1250 },
    { id: 'old', shiftStartAt: '2026-10-25T08:00:00+05:30', shiftEndAt: '2026-10-25T18:00:00+05:30', revenue: 999 },
  ],
  trips: [
    { id: 'completed', shiftId: 'today', status: 'COMPLETED', tripStartAt: '2026-10-26T09:00:00+05:30', tripEndAt: '2026-10-26T09:30:00+05:30', revenue: 1000 },
    { id: 'cancel-fee', shiftId: 'today', status: 'CANCELLED', tripStartAt: '2026-10-26T10:00:00+05:30', cancelledAt: '2026-10-26T10:02:00+05:30', cancelledRevenue: 250 },
    { id: 'blank-cancel', shiftId: 'today', status: 'CANCELLED', tripStartAt: '2026-10-26T11:00:00+05:30', revenue: '' },
    { id: 'overnight-cancel', shiftId: 'today', status: 'CANCELLED', tripStartAt: '2026-10-25T23:50:00+05:30', cancelledRevenue: 50 },
    { id: 'old-cancel', shiftId: 'old', status: 'CANCELLED', tripStartAt: '2026-10-25T11:00:00+05:30', cancelledRevenue: 400 },
  ],
}
const metrics = { revenue: 1250, fuelCost: 300, fuelCostPerKm: 2.5, breakEvenInputs: { fuelCostPerKmSource: 'FULL_TANK_INTERVAL' }, authority: { revenue: 'SHIFT_END_REVENUE' } }
const result = derivePhaseOnePerformanceOverview(snapshot, range, metrics)
assert.equal(result.completedRides, 1)
assert.equal(result.cancellationFees, 300, 'blank cancellation fees are zero; cancellation fees follow their authoritative shift revenue period')
assert.equal(result.fareIncome, 950)
assert.equal(result.fuelSpending, 300)
assert.equal(result.fuelCostPerKm, 2.5)
assert.equal(result.incomeAfterFuel, 950, 'net after fuel includes cancellation fees')
assert.equal(result.revenueAuthority, 'SHIFT_END_REVENUE')
assert.throws(() => derivePhaseOnePerformanceOverview(snapshot, { from: new Date('2026-10-27'), to: new Date('2026-10-26') }, metrics), /invalid/i)
console.log('Performance Phase 1 overview contract: PASS')
