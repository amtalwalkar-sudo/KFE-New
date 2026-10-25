import assert from 'node:assert/strict'
import { deriveRollingDriverTarget, stabilizeActiveDay } from '../domain/performance/driverTargetStabilization.js'

const unconfigured = stabilizeActiveDay({ baseTarget: null, balance: 0 })
assert.equal(unconfigured.available, false)
assert.equal(unconfigured.target, null)
assert.equal(unconfigured.nextBalance, null)

const current = stabilizeActiveDay({ baseTarget: 1000, balance: 250 })
assert.equal(current.available, true)
assert.equal(current.target, 1250)
assert.equal(current.nextBalance, null, 'An unfinished day must not book a shortfall before actual revenue is known')

const completed = stabilizeActiveDay({ baseTarget: 1000, balance: 250, actualRevenue: 800 })
assert.equal(completed.target, 1250)
assert.equal(completed.nextBalance, 450, 'A completed day carries forward its signed target-minus-revenue balance')

const surplus = stabilizeActiveDay({ baseTarget: 1000, balance: -1500, actualRevenue: 1200 })
assert.equal(surplus.target, 0, 'Surplus credit may floor the displayed target at zero')
assert.equal(surplus.nextBalance, -1700, 'The signed surplus credit must be preserved for later active days')

const day = new Date('2026-10-25T04:00:00.000Z')
const result = deriveRollingDriverTarget({
  trips: [{ id: 'fare-detail', status: 'COMPLETED', tripEndAt: '2026-10-25T12:00:00.000Z', revenue: 9999 }],
  shifts: [
    { id: 'completed', status: 'COMPLETED', shiftStartAt: '2026-10-25T04:00:00.000Z', shiftEndAt: '2026-10-25T12:00:00.000Z', revenue: 500 },
    { id: 'deleted', status: 'COMPLETED', shiftStartAt: '2026-10-25T04:00:00.000Z', shiftEndAt: '2026-10-25T12:00:00.000Z', revenue: 5000, deletedAt: '2026-10-26T00:00:00.000Z' },
  ],
  driverTargets: [{ id: 'target', effectiveFrom: '2026-10-01', effectiveUntil: '2026-10-31', desiredDriverProfit: 0, active: true }],
  from: day,
  to: new Date('2026-10-25T18:29:59.999Z'),
  applicableBreakEven: 31000,
})
assert.equal(result.available, true)
assert.equal(result.currentBaseDaily, 1000, 'Monthly target uses calendar days, not elapsed/effective-window days')
assert.equal(result.currentDailyTarget, 1000)
assert.equal(result.balance, 500, 'Rolling balance must use completed shift revenue, never trip-fare detail or soft-deleted shifts')
assert.equal(result.authority, 'COMPLETED_SHIFT_REVENUE_AND_SHIFTS_FOR_ACTIVE_DAYS')

const nonWorking = deriveRollingDriverTarget({
  shifts: [{ id: 'off-day', status: 'COMPLETED', shiftStartAt: '2026-10-25T04:00:00.000Z', shiftEndAt: '2026-10-25T12:00:00.000Z', revenue: 500 }],
  driverTargets: [{ id: 'target', effectiveFrom: '2026-10-01', effectiveUntil: '2026-10-31', desiredDriverProfit: 0, nonWorkingDates: '2026-10-25', active: true }],
  from: day,
  to: new Date('2026-10-25T18:29:59.999Z'),
  applicableBreakEven: 31000,
})
assert.equal(nonWorking.available, false, 'A planned non-working date must not generate an active-day target')
assert.equal(nonWorking.currentDailyTarget, null)

const invalidPeriod = deriveRollingDriverTarget({ from: 'not-a-date', to: day })
assert.equal(invalidPeriod.available, false)
assert.equal(invalidPeriod.reason, 'INVALID_PERIOD')

console.log('Driver target stabilization contract passed: signed carry-forward, zero-floor display, completed-shift revenue authority, deleted-record exclusion, calendar-month denominator, and non-working dates.')
