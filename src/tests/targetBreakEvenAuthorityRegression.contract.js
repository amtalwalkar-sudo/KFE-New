import assert from 'node:assert/strict'
import { calculateRollingFuelCostPerKm } from '../domain/math/fuel.js'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'

const fuel = calculateRollingFuelCostPerKm([
  { id: 'a0', vehicleId: 'A', capturedAt: '2026-01-01T00:00:00Z', odometer: 0, amount: 100, isFullTank: true },
  { id: 'b0', vehicleId: 'B', capturedAt: '2026-01-02T00:00:00Z', odometer: 0, amount: 100, isFullTank: true },
  { id: 'a1', vehicleId: 'A', capturedAt: '2026-01-03T00:00:00Z', odometer: 100, amount: 100, isFullTank: true },
  { id: 'b1', vehicleId: 'B', capturedAt: '2026-01-04T00:00:00Z', odometer: 100, amount: 300, isFullTank: true },
], 1)
assert.equal(fuel.observations.length, 1)
assert.equal(fuel.observations[0].vehicleId, 'B')
assert.equal(fuel.observations[0].costPerKm, 3, 'Rolling window must select the globally latest chronological interval')

const rolling = deriveRollingDriverTarget({
  trips: [
    { id: 'trip', status: 'COMPLETED', tripEndAt: '2026-09-10T20:00:00.000Z', revenue: 9999 },
  ],
  shifts: [
    { id: 'shift', status: 'COMPLETED', shiftStartAt: '2026-09-10T19:00:00.000Z', shiftEndAt: '2026-09-10T20:00:00.000Z', revenue: 100 },
  ],
  driverTargets: [
    { id: 'target', effectiveFrom: '2026-01-01', effectiveUntil: '2026-12-31', desiredDriverProfit: 0, active: true },
  ],
  from: new Date('2026-09-10T18:30:00.000Z'),
  to: new Date('2026-09-11T18:29:59.999Z'),
  applicableBreakEven: 73000,
})
assert.equal(rolling.activeDays, 1, 'Shift timestamps must be grouped by IST business day, not UTC date')
assert.equal(rolling.authority, 'COMPLETED_SHIFT_REVENUE_AND_SHIFTS_FOR_ACTIVE_DAYS')
assert.equal(rolling.balance, 100, 'Rolling recovery must use the authoritative ₹100 Shift revenue, not the ₹9,999 trip fare')

console.log('Target/break-even authority regression vectors: PASS')
