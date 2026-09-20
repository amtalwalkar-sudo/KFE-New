import assert from 'node:assert/strict'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'

const common = {
  trips: [{ id: 't1', status: 'COMPLETED', tripEndAt: '2026-09-10T12:00:00Z' }],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 1000, active: true }],
  from: new Date('2026-09-01T00:00:00Z'),
  to: new Date('2026-09-10T23:59:59Z'),
  applicableBreakEven: 10000,
}
const baseShifts = [{ id: 's1', shiftEndAt: '2026-09-10T18:00:00Z', revenue: 1000 }]
const futureShifts = [...baseShifts, { id: 'future', shiftEndAt: '2026-09-20T18:00:00Z', revenue: 999999 }]

const base = deriveRollingDriverTarget({ ...common, shifts: baseShifts })
const future = deriveRollingDriverTarget({ ...common, shifts: futureShifts })

assert.equal(base.available, true)
assert.equal(future.available, true)
assert.equal(future.currentDailyTarget, base.currentDailyTarget)
assert.equal(future.closingBalance, base.closingBalance)

console.log('Phase 5 as-of domain invariant contract: PASS')
