import assert from 'node:assert/strict'
import { deriveAuthoritativeDriverTarget, getApplicableDriverTarget, resolveDriverTargetAuthority } from '../domain/performance/driverTarget.js'

const target = deriveAuthoritativeDriverTarget({
  monthlyBreakEvenRevenue: 10000,
  desiredDriverProfitMonthly: 4000,
  calendarDays: 30,
})
assert.equal(target.available, true)
assert.equal(target.monthlyTarget, 14000)
assert.equal(target.target, 14000 / 30)
assert.equal(target.authority, 'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT')

const missing = deriveAuthoritativeDriverTarget({
  monthlyBreakEvenRevenue: 10000,
  desiredDriverProfitMonthly: 4000,
  calendarDays: 0,
})
assert.equal(missing.available, false)
assert.equal(missing.target, null)

const record = getApplicableDriverTarget([
  { effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 4000, active: true },
  { effectiveFrom: '2026-10-01', effectiveUntil: '2026-10-31', desiredDriverProfit: 5000, active: true },
], '2026-10-03')
assert.equal(record.desiredDriverProfit, 5000)

console.log('Driver target contract passed: authoritative monthly break-even + Admin desired profit, divided by calendar days.')

const missingProfit = deriveAuthoritativeDriverTarget({
  monthlyBreakEvenRevenue: 10000,
  desiredDriverProfitMonthly: null,
  calendarDays: 30,
})
assert.equal(missingProfit.available, false, 'Missing profit must not be coerced to an explicit ₹0')
assert.equal(missingProfit.target, null)

const explicitZeroProfit = deriveAuthoritativeDriverTarget({
  monthlyBreakEvenRevenue: 10000,
  desiredDriverProfitMonthly: 0,
  calendarDays: 30,
})
assert.equal(explicitZeroProfit.available, true, 'Explicit ₹0 remains a valid entered value')
assert.equal(explicitZeroProfit.target, 10000 / 30)

const sharedRolling = resolveDriverTargetAuthority({
  monthlyBreakEvenRevenue: 10000,
  desiredDriverProfitMonthly: 4000,
  calendarDays: 30,
  rollingTarget: { available: true, currentDailyTarget: 777 },
  breakEvenStatus: 'AUTHORITATIVE',
})
assert.equal(sharedRolling.target, 777, 'Shared target authority must prefer rolling recovery when available')
const sharedBase = resolveDriverTargetAuthority({
  monthlyBreakEvenRevenue: 10000,
  desiredDriverProfitMonthly: 4000,
  calendarDays: 30,
  rollingTarget: { available: false, reason: 'NO_APPLICABLE_ACTIVE_DAY_TARGET' },
  breakEvenStatus: 'AUTHORITATIVE',
})
assert.equal(sharedBase.target, 14000 / 30, 'The shared authority supplies the same base target before a rolling active day exists')
assert.equal(sharedBase.authority, 'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT')
