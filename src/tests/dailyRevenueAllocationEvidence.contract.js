import assert from 'node:assert/strict'
import { deriveDailyRevenueAllocation } from '../domain/performance/dailyRevenueAllocation.js'

const complete = {
  revenue: 2000,
  monthlyBreakEvenRevenue: 30000,
  scheduledEmi: 11324,
  preBusinessRecovery: 0,
  maintenanceProvision: 1000,
  complianceProvision: 500,
  historicalMaintenanceRecovery: 0,
}
const valid = deriveDailyRevenueAllocation(complete)
assert.equal(valid.available, true, 'explicit zero recovery components are valid evidence')
assert.equal(valid.financialObligation, 11324)
assert.equal(valid.otherRequired, 0)

for (const key of ['preBusinessRecovery', 'historicalMaintenanceRecovery']) {
  for (const missing of [undefined, null, '']) {
    const result = deriveDailyRevenueAllocation({ ...complete, [key]: missing })
    assert.equal(result.available, false, `${key}=${String(missing)} must not be silently coerced to zero`)
    assert.equal(result.reason, 'INCOMPLETE_DAILY_REVENUE_ALLOCATION_INPUTS')
    assert.equal(result.totalAllocation, null)
  }
}
console.log('Daily revenue allocation evidence completeness contract: PASS')
