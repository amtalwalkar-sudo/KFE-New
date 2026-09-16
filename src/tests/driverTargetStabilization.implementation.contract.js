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
  from: '2026-09-10',
  to: '2026-09-10',
  trips: [],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', targetRevenue: 2000 }]
})
assert.equal(offDay.activeDays, 0)
assert.equal(offDay.currentDailyTarget, null)

const activeDays = deriveRollingDriverTarget({
  from: '2026-09-10',
  to: '2026-09-11',
  trips: [
    { status: 'COMPLETED', tripEndAt: '2026-09-10T10:00:00Z', revenue: 1000 },
    { status: 'COMPLETED', tripEndAt: '2026-09-11T10:00:00Z', revenue: 1200 }
  ],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', targetRevenue: 2000, workingDays: 2 }]
})
assert.equal(activeDays.currentBaseDaily, 1000)
assert.equal(activeDays.currentDailyTarget, 1000)

console.log('Driver target stabilization implementation contract passed.')
