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

const holiday = deriveRollingDriverTarget({
  from: '2026-09-10', to: '2026-09-10',
  trips: [],
  shifts: [{ shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T20:00:00Z', revenue: 0 }],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200, workingDays: 2 }],
  applicableBreakEven: 800
})
assert.equal(holiday.activeDays, 0)
assert.equal(holiday.currentDailyTarget, null)
assert.equal(holiday.reason, 'NO_FINANCIAL_DRIVER_TARGET_DAY')

const financialDays = deriveRollingDriverTarget({
  from: '2026-09-10', to: '2026-09-11',
  trips: [
    { status: 'COMPLETED', tripEndAt: '2026-09-10T10:00:00Z', revenue: 500 },
    { status: 'COMPLETED', tripEndAt: '2026-09-11T10:00:00Z', revenue: 600 }
  ],
  shifts: [
    { shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T12:00:00Z', revenue: 500 },
    { shiftStartAt: '2026-09-11T08:00:00Z', shiftEndAt: '2026-09-11T12:00:00Z', revenue: 600 }
  ],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200, workingDays: 2 }],
  applicableBreakEven: 800
})
assert.equal(financialDays.activeDays, 2)
assert.equal(financialDays.effectiveMonthlyTarget, 1000)
assert.equal(financialDays.remainingEligibleDays, 20)
assert.equal(financialDays.targetAllocatedBeforeCurrentDay, 1000 / 21)
assert.ok(Math.abs(financialDays.currentDailyTarget - 1000 / 21) < 1e-12)
assert.equal(financialDays.monthlyVariance, -100)
assert.equal(financialDays.closingBalance, -100)

const holidaySmoothing = deriveRollingDriverTarget({
  from: '2026-09-10', to: '2026-09-12',
  trips: [
    { status: 'COMPLETED', tripEndAt: '2026-09-10T10:00:00Z', revenue: 0 },
    { status: 'COMPLETED', tripEndAt: '2026-09-12T10:00:00Z', revenue: 0 }
  ],
  shifts: [
    { shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T12:00:00Z', revenue: 0 },
    { shiftStartAt: '2026-09-12T08:00:00Z', shiftEndAt: '2026-09-12T12:00:00Z', revenue: 0 }
  ],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200, workingDays: 2 }],
  applicableBreakEven: 800
})
assert.equal(holidaySmoothing.activeDays, 2)
assert.equal(holidaySmoothing.remainingEligibleDays, 19)
assert.ok(Math.abs(holidaySmoothing.currentDailyTarget - ((1000 - 1000 / 21) / 19)) < 1e-12)

const missingAuthoritativeInput = deriveRollingDriverTarget({
  from: '2026-09-12', to: '2026-09-12',
  trips: [{ status: 'COMPLETED', tripEndAt: '2026-09-12T10:00:00Z', revenue: 0 }],
  shifts: [{ shiftStartAt: '2026-09-12T08:00:00Z', shiftEndAt: '2026-09-12T12:00:00Z', revenue: 0 }],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', targetRevenue: 2000, workingDays: 2 }],
  applicableBreakEven: 800
})
assert.equal(missingAuthoritativeInput.available, false)
assert.equal(missingAuthoritativeInput.currentDailyTarget, null)

const missingWorkingDays = deriveRollingDriverTarget({
  from: '2026-09-12', to: '2026-09-12',
  trips: [{ status: 'COMPLETED', tripEndAt: '2026-09-12T10:00:00Z', revenue: 0 }],
  shifts: [{ shiftStartAt: '2026-09-12T08:00:00Z', shiftEndAt: '2026-09-12T12:00:00Z', revenue: 0 }],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200 }],
  applicableBreakEven: 800
})
assert.equal(missingWorkingDays.available, true)
assert.equal(missingWorkingDays.remainingEligibleDays, 19)
assert.ok(Math.abs(missingWorkingDays.currentDailyTarget - 1000 / 19) < 1e-12)

const monthlyRollover = deriveRollingDriverTarget({
  from: '2026-09-01', to: '2026-09-30',
  trips: [
    { status: 'COMPLETED', tripEndAt: '2026-08-10T10:00:00Z', revenue: 0 },
    { status: 'COMPLETED', tripEndAt: '2026-09-10T10:00:00Z', revenue: 0 }
  ],
  shifts: [
    { shiftStartAt: '2026-08-10T08:00:00Z', shiftEndAt: '2026-08-10T12:00:00Z', revenue: 0 },
    { shiftStartAt: '2026-09-10T08:00:00Z', shiftEndAt: '2026-09-10T12:00:00Z', revenue: 0 }
  ],
  driverTargets: [
    { effectiveFrom: '2026-08-01', effectiveUntil: '2026-08-31', desiredDriverProfit: 200, workingDays: 2 },
    { effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200, workingDays: 2 }
  ],
  applicableBreakEven: 800,
  historicalBreakEvenForDay: () => 800,
})
assert.equal(monthlyRollover.activeDays, 1)
assert.equal(monthlyRollover.balanceBefore, 1000)
assert.equal(monthlyRollover.openingBalance, 1000)
assert.equal(monthlyRollover.effectiveMonthlyTarget, 2000)
assert.equal(monthlyRollover.remainingEligibleDays, 21)
assert.ok(Math.abs(monthlyRollover.currentDailyTarget - 2000 / 21) < 1e-12)
assert.equal(monthlyRollover.monthlyVariance, 1000)
assert.equal(monthlyRollover.closingBalance, 2000)

const incompleteHistoricalBalance = deriveRollingDriverTarget({
  from: '2026-09-12', to: '2026-09-12',
  trips: [
    { status: 'COMPLETED', tripEndAt: '2026-08-10T10:00:00Z', revenue: 500 },
    { status: 'COMPLETED', tripEndAt: '2026-09-12T10:00:00Z', revenue: 0 }
  ],
  shifts: [
    { shiftStartAt: '2026-08-10T08:00:00Z', shiftEndAt: '2026-08-10T12:00:00Z', revenue: 500 },
    { shiftStartAt: '2026-09-12T08:00:00Z', shiftEndAt: '2026-09-12T12:00:00Z', revenue: 0 }
  ],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 200, workingDays: 2 }],
  historicalBreakEvenForDay: () => null,
})
assert.equal(incompleteHistoricalBalance.available, false)
assert.equal(incompleteHistoricalBalance.reason, 'MISSING_HISTORICAL_DRIVER_TARGET_INPUT')
assert.equal(incompleteHistoricalBalance.currentDailyTarget, null)


const partialSyntheticWindow = deriveRollingDriverTarget({
  from: '2026-09-12', to: '2026-09-18',
  trips: [{ status: 'COMPLETED', tripEndAt: '2026-09-17T10:00:00Z', revenue: 0 }],
  shifts: [{ shiftStartAt: '2026-09-17T08:00:00Z', shiftEndAt: '2026-09-17T20:00:00Z', revenue: 0 }],
  driverTargets: [{ effectiveFrom: '2026-05-01', effectiveUntil: '2026-09-18', desiredDriverProfit: 200, workingDays: 6 }],
  applicableBreakEven: 800,
})
assert.equal(partialSyntheticWindow.available, true)
assert.equal(partialSyntheticWindow.balanceBefore, 0)
assert.equal(partialSyntheticWindow.currentTargetMonth, '2026-09')
assert.ok(partialSyntheticWindow.currentDailyTarget > 0)

console.log('Driver target stabilization implementation contract passed.')
