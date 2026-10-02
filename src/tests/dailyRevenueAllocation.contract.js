import assert from 'node:assert/strict'
import { deriveDailyRevenueAllocation } from '../domain/performance/dailyRevenueAllocation.js'

const allocation = deriveDailyRevenueAllocation({
  revenue: 5000,
  monthlyBreakEvenRevenue: 50000,
  scheduledEmi: 15000,
  preBusinessRecovery: 0,
  maintenanceProvision: 10000,
  complianceProvision: 5000,
  historicalMaintenanceRecovery: 0,
})
assert.equal(allocation.available, true)
assert.equal(allocation.allocations.financialObligation, 1500)
assert.equal(allocation.allocations.maintenanceProvision, 1000)
assert.equal(allocation.allocations.complianceProvision, 500)
assert.equal(allocation.totalAllocation, 3000)
assert.equal(allocation.availableAfterAllocations, 2000)

console.log('Daily revenue obligation allocation contract: PASS')
