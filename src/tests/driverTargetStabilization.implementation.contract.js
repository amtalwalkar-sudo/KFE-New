import assert from 'node:assert/strict'
import { stabilizeActiveDay, deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'

const below = stabilizeActiveDay({ baseTarget: 1200, balance: 0, actualRevenue: 1000 })
assert.equal(below.target, 1200)
assert.equal(below.nextBalance, 200)

const recovery = stabilizeActiveDay({ baseTarget: 1200, balance: 200, actualRevenue: 1400 })
assert.equal(recovery.target, 1400)
assert.equal(recovery.nextBalance, 0)

const surplus = stabilizeActiveDay({ baseTarget: 1200, balance: 0, actualRevenue: 1400 })
assert.equal(surplus.nextBalance, -200)
assert.equal(stabilizeActiveDay({ baseTarget: 1200, balance: -200 }).target, 1000)

const offDay = deriveRollingDriverTarget({
  from: '2026-09-10', to: '2026-09-10', trips: [], shifts: [],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200, workingDays: 2 }],
  applicableBreakEven: 800
})
assert.equal(offDay.activeDays, 0)
assert.equal(offDay.currentDailyTarget, null)

const activeDays = deriveRollingDriverTarget({
  from: '2026-09-10', to: '2026-09-11',
  shifts: [
    { shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T20:00:00Z' },
    { shiftStartAt: '2026-09-11T08:00:00Z', shiftEndAt: '2026-09-11T20:00:00Z' }
  ],
  trips: [
    { status: 'COMPLETED', tripEndAt: '2026-09-10T10:00:00Z', revenue: 500 },
    { status: 'COMPLETED', tripEndAt: '2026-09-11T10:00:00Z', revenue: 600 }
  ],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200, workingDays: 2 }],
  applicableBreakEven: 800
})
assert.equal(activeDays.activeDays, 2)
assert.equal(activeDays.currentBaseDaily, 500)
assert.equal(activeDays.currentDailyTarget, 500)
// Both days are in the same month: their actual revenue does not change the
// daily target for the rest of that month. The monthly result rolls forward later.
assert.equal(activeDays.balance, 0)

const zeroRevenueActiveDay = deriveRollingDriverTarget({
  from: '2026-09-12', to: '2026-09-12',
  shifts: [{ shiftStartAt: '2026-09-12T08:00:00Z', shiftEndAt: '2026-09-12T20:00:00Z' }],
  trips: [],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200, workingDays: 2 }],
  applicableBreakEven: 800
})
assert.equal(zeroRevenueActiveDay.activeDays, 1)
assert.equal(zeroRevenueActiveDay.currentDailyTarget, 500)
assert.equal(zeroRevenueActiveDay.balance, 0)

const missingAuthoritativeInput = deriveRollingDriverTarget({
  from: '2026-09-12', to: '2026-09-12',
  shifts: [{ shiftStartAt: '2026-09-12T08:00:00Z', shiftEndAt: '2026-09-12T20:00:00Z' }],
  trips: [],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', targetRevenue: 2000, workingDays: 2 }],
  applicableBreakEven: 800
})
assert.equal(missingAuthoritativeInput.available, false)
assert.equal(missingAuthoritativeInput.currentDailyTarget, null)

const missingWorkingDays = deriveRollingDriverTarget({
  from: '2026-09-12', to: '2026-09-12',
  shifts: [{ shiftStartAt: '2026-09-12T08:00:00Z', shiftEndAt: '2026-09-12T20:00:00Z' }],
  trips: [],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200 }],
  applicableBreakEven: 800
})
assert.equal(missingWorkingDays.available, false)
assert.equal(missingWorkingDays.currentDailyTarget, null)

// A completed month's shortfall is what rolls into the next month.
const monthlyRollover = deriveRollingDriverTarget({
  from: '2026-09-01', to: '2026-09-30',
  shifts: [
    { shiftStartAt: '2026-08-10T08:00:00Z', shiftEndAt: '2026-08-10T20:00:00Z' },
    { shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T20:00:00Z' }
  ],
  trips: [
    { status: 'COMPLETED', tripEndAt: '2026-08-10T10:00:00Z', revenue: 0 },
    { status: 'COMPLETED', tripEndAt: '2026-09-10T10:00:00Z', revenue: 0 }
  ],
  driverTargets: [
    { effectiveFrom: '2026-08-01', effectiveUntil: '2026-08-31', desiredDriverProfit: 200, workingDays: 2 },
    { effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200, workingDays: 2 }
  ],
  applicableBreakEvenForDay: () => 800,
  historicalBreakEvenForDay: () => 800,
})
assert.equal(monthlyRollover.activeDays, 1)
assert.equal(monthlyRollover.currentBaseDaily, 500)
assert.equal(monthlyRollover.balanceBefore, 1000)
assert.equal(monthlyRollover.currentDailyTarget, 1000)

const incompleteHistoricalBalance = deriveRollingDriverTarget({
  from: '2026-09-12', to: '2026-09-12',
  shifts: [
    { shiftStartAt: '2026-08-10T08:00:00Z', shiftEndAt: '2026-08-10T20:00:00Z' },
    { shiftStartAt: '2026-09-12T08:00:00Z', shiftEndAt: '2026-09-12T20:00:00Z' }
  ],
  trips: [{ status: 'COMPLETED', tripEndAt: '2026-08-10T10:00:00Z', revenue: 500 }],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200, workingDays: 2 }],
  historicalBreakEvenForDay: () => null,
})
assert.equal(incompleteHistoricalBalance.available, false)
assert.equal(incompleteHistoricalBalance.reason, 'MISSING_HISTORICAL_DRIVER_TARGET_INPUT')
assert.equal(incompleteHistoricalBalance.currentDailyTarget, null)

console.log('Driver target stabilization implementation contract passed.')
