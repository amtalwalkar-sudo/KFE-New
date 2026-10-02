import assert from 'node:assert/strict'
import { deriveRollingDriverTarget } from '../domain/performance/driverTargetStabilization.js'
const targets=[{effectiveFrom:'2026-09-01',effectiveUntil:'2026-09-30',desiredDriverProfit:6000,active:true}]
const t=deriveRollingDriverTarget({from:'2026-09-10',to:'2026-09-10',driverTargets:targets,applicableBreakEven:24000,historicalIndicativeProfitForMonth:()=>-999999,operatingKmForecast:{calculatedForecast:{dailyKm:999999}}})
assert.equal(t.available,true);assert.equal(t.effectiveMonthlyTarget,30000);assert.ok(t.currentDailyTarget>1000);assert.equal(t.openingRecovery,0);assert.ok(t.recoveryAdjustment>0);assert.equal(t.closingBalance,9000);
assert.equal(deriveRollingDriverTarget({from:'2026-09-01',to:'2026-09-01',driverTargets:targets,applicableBreakEven:24000}).available,true)
const changed=deriveRollingDriverTarget({from:'2026-09-20',to:'2026-09-20',driverTargets:[...targets,{effectiveFrom:'2026-09-15',effectiveUntil:'2026-09-30',desiredDriverProfit:9000,active:true}],applicableBreakEven:24000});assert.equal(changed.effectiveMonthlyTarget,33000);assert.ok(changed.currentDailyTarget>1100)
console.log('Driver target simple formula implementation contract: PASS')
