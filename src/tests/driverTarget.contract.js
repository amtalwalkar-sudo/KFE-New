import assert from 'node:assert/strict'
import { deriveAuthoritativeDriverTarget, getApplicableDriverTarget } from '../domain/performance/driverTarget.js'

const target = deriveAuthoritativeDriverTarget({
  monthlyBreakEvenRevenue: 10000,
  desiredDriverProfitMonthly: 4000,
  calendarDays: 30,
})
assert.equal(target.available, true)
assert.equal(target.monthlyTarget, 14000)
assert.equal(target.dailyTarget, 14000 / 30)
assert.equal(target.authority, 'MONTHLY_BREAK_EVEN_PLUS_ADMIN_MONTHLY_DRIVER_PROFIT')

const missing = deriveAuthoritativeDriverTarget({
  monthlyBreakEvenRevenue: 10000,
  desiredDriverProfitMonthly: 4000,
  calendarDays: 0,
})
assert.equal(missing.available, false)
assert.equal(missing.dailyTarget, null)

const record = getApplicableDriverTarget([
  { effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 4000, active: true },
  { effectiveFrom: '2026-10-01', effectiveUntil: '2026-10-31', desiredDriverProfit: 5000, active: true },
], '2026-10-03')
assert.equal(record.desiredDriverProfit, 5000)

console.log('Driver target contract passed: authoritative monthly break-even + Admin desired profit, divided by calendar days.')
