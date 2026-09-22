import assert from 'node:assert/strict'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'

const rollover = deriveRollingDriverTarget({
  from: '2026-09-10', to: '2026-09-10',
  trips: [
    { status: 'COMPLETED', tripEndAt: '2026-08-10T10:00:00Z' },
    { status: 'COMPLETED', tripEndAt: '2026-09-10T10:00:00Z' }
  ],
  shifts: [
    { shiftStartAt: '2026-08-10T08:00:00Z', shiftEndAt: '2026-08-10T12:00:00Z', revenue: 0 },
    { shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T12:00:00Z', revenue: 0 }
  ],
  driverTargets: [
    { effectiveFrom: '2026-08-01', effectiveUntil: '2026-08-31', desiredDriverProfit: 200 },
    { effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200 }
  ],
  applicableBreakEven: 800,
  historicalBreakEvenForDay: () => 800,
  historicalIndicativeProfitForMonth: () => -10000,
})
assert.equal(rollover.openingRecovery, 10000)
assert.equal(rollover.newRecovery, null)
assert.equal(rollover.recoveryAllocated, 10000)
assert.equal(rollover.recoveryAchieved, null)
assert.equal(rollover.closingRecovery, null)
assert.equal(rollover.dailyRecovery, 10000 / 30)
assert.equal(rollover.currentDailyTarget, (800 + 200) / 21 + 10000 / 30)

const currentProfit = deriveRollingDriverTarget({
  from: '2026-09-10', to: '2026-09-10',
  trips: [
    { status: 'COMPLETED', tripEndAt: '2026-08-10T10:00:00Z' },
    { status: 'COMPLETED', tripEndAt: '2026-09-10T10:00:00Z' }
  ],
  shifts: [
    { shiftStartAt: '2026-08-10T08:00:00Z', shiftEndAt: '2026-08-10T12:00:00Z', revenue: 0 },
    { shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T12:00:00Z', revenue: 0 }
  ],
  driverTargets: [
    { effectiveFrom: '2026-08-01', effectiveUntil: '2026-08-31', desiredDriverProfit: 200 },
    { effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200 }
  ],
  applicableBreakEven: 800,
  historicalBreakEvenForDay: () => 800,
  historicalIndicativeProfitForMonth: () => -10000,
  indicativeProfitForCurrentMonth: () => 7000,
})
assert.equal(currentProfit.openingRecovery, 10000)
assert.equal(currentProfit.newRecovery, null)
assert.equal(currentProfit.recoveryAchieved, 7000)
assert.equal(currentProfit.closingRecovery, 3000)
assert.equal(currentProfit.dailyRecovery, 10000 / 30)
assert.equal(currentProfit.currentDailyTarget, (800 + 200) / 21 + 10000 / 30)

// A current-month loss is provisional: it is visible as indicative loss but
// does not change opening recovery/current target; it becomes next month's recovery at close.
const currentLoss = deriveRollingDriverTarget({
  from: '2026-09-10', to: '2026-09-10',
  trips: [
    { status: 'COMPLETED', tripEndAt: '2026-09-10T10:00:00Z' }
  ],
  shifts: [{ shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T12:00:00Z', revenue: 0 }],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200 }],
  applicableBreakEven: 800,
  indicativeProfitForCurrentMonth: () => -5000,
})
assert.equal(currentLoss.openingRecovery, 0)
assert.equal(currentLoss.newRecovery, null)
assert.equal(currentLoss.closingRecovery, 0)
assert.equal(currentLoss.currentDailyTarget, 1000 / 21)

console.log('Frozen loss-recovery implementation contract passed.')
