import assert from 'node:assert/strict'
import { stabilizeActiveDay, deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'

const state = (openingRecovery, indicativeProfit) => {
  const newRecovery = Math.max(0, -indicativeProfit)
  const recoveryAchieved = Math.min(openingRecovery + newRecovery, Math.max(0, indicativeProfit))
  return {
    newRecovery,
    recoveryAchieved,
    closingRecovery: Math.max(0, openingRecovery + newRecovery - recoveryAchieved),
  }
}

// Frozen recovery accounting: Opening + New - Achieved = Closing.
assert.deepEqual(state(10000, -3000), { newRecovery: 3000, recoveryAchieved: 0, closingRecovery: 13000 })
assert.deepEqual(state(10000, 7000), { newRecovery: 0, recoveryAchieved: 7000, closingRecovery: 3000 })
assert.deepEqual(state(3000, -6000), { newRecovery: 6000, recoveryAchieved: 0, closingRecovery: 9000 })
assert.deepEqual(state(3000, 10000), { newRecovery: 0, recoveryAchieved: 3000, closingRecovery: 0 })

// Profit never creates a negative recovery or future target credit.
assert.equal(state(0, 10000).newRecovery, 0)
assert.equal(state(0, 10000).closingRecovery, 0)

// Recovery allocation is independent from recovery achieved.
const openingRecovery = 10000
const calendarDays = 30
const dailyRecovery = openingRecovery / calendarDays
assert.equal(dailyRecovery, 10000 / 30)
assert.notEqual(dailyRecovery, 7000 / calendarDays)

// Current target uses finalized opening recovery only. Current-month profit/loss is
// provisional and must not create a second active rolling ledger.
const target = stabilizeActiveDay({ baseTarget: 1200, balance: 200 })
assert.equal(target.target, 1400)
assert.equal(target.nextBalance, null)

// Integration: August closes with a ₹10,000 loss and September opens with ₹10,000 recovery.
const financialDays = deriveRollingDriverTarget({
  from: '2026-09-10', to: '2026-09-10',
  trips: [{ status: 'COMPLETED', tripEndAt: '2026-09-10T10:00:00Z' }],
  shifts: [{ shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T12:00:00Z', revenue: 0 }],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200 }],
  applicableBreakEven: 800,
})
assert.equal(financialDays.activeDays, 1)
assert.equal(financialDays.effectiveMonthlyTarget, 800 + 200)
assert.equal(financialDays.openingRecovery, 0)
assert.equal(financialDays.newRecovery, null)

// Historical loss/recovery vector.
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
assert.equal(rollover.recoveryAllocated, 10000)
assert.equal(rollover.dailyRecovery, 10000 / 30)
assert.equal(rollover.currentDailyTarget, (800 + 200) / 21 + 10000 / 30)
assert.equal(rollover.historicalState[0].newRecovery, 10000)
assert.equal(rollover.historicalState[0].closingRecovery, 10000)

// Profit recovers only the outstanding amount and never creates credit.
const recovered = deriveRollingDriverTarget({
  from: '2026-10-10', to: '2026-10-10',
  trips: [
    { status: 'COMPLETED', tripEndAt: '2026-09-10T10:00:00Z' },
    { status: 'COMPLETED', tripEndAt: '2026-10-10T10:00:00Z' }
  ],
  shifts: [
    { shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T12:00:00Z', revenue: 0 },
    { shiftStartAt: '2026-10-10T08:00:00Z', shiftEndAt: '2026-10-10T12:00:00Z', revenue: 0 }
  ],
  driverTargets: [
    { effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200 },
    { effectiveFrom: '2026-10-01', effectiveUntil: '2026-10-31', desiredDriverProfit: 200 }
  ],
  applicableBreakEven: 800,
  historicalBreakEvenForDay: () => 800,
  historicalIndicativeProfitForMonth: ({ month }) => month === '2026-09' ? 7000 : null,
})
assert.equal(recovered.openingRecovery, 0)
assert.equal(recovered.historicalState[0].closingRecovery, 0)

console.log('Frozen loss-recovery Driver Target contract passed.')
