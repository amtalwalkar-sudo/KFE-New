import assert from 'node:assert/strict'
import { getPerformanceOutlookDisplay } from '../application/performance/performancePresentation.js'

const authoritative = getPerformanceOutlookDisplay({
  monthlyBreakEvenRevenue: 18500,
  indicativeMonthlyBreakEvenRevenue: 19000,
  driverTarget: 24500,
  driverTargetAvailable: true,
  revenue: 7300,
  calculationEvidence: { breakEven: { status: 'AUTHORITATIVE' } },
})
assert.equal(authoritative.breakEven, 18500)
assert.equal(authoritative.breakEvenStatus, 'AUTHORITATIVE')
assert.equal(authoritative.target, 24500)
assert.equal(authoritative.targetStatus, 'AUTHORITATIVE')
assert.equal(authoritative.revenue, 7300)

const indicative = getPerformanceOutlookDisplay({
  monthlyBreakEvenRevenue: null,
  indicativeMonthlyBreakEvenRevenue: 19000,
  driverTarget: null,
  driverTargetAvailable: false,
  revenue: 0,
  calculationEvidence: { breakEven: { status: 'INDICATIVE' } },
})
assert.equal(indicative.breakEven, 19000)
assert.equal(indicative.breakEvenStatus, 'INDICATIVE')
assert.equal(indicative.target, null)
assert.equal(indicative.targetStatus, 'UNAVAILABLE')
assert.equal(indicative.revenue, 0)

const unavailable = getPerformanceOutlookDisplay({
  monthlyBreakEvenRevenue: null,
  indicativeMonthlyBreakEvenRevenue: null,
  driverTarget: 0,
  driverTargetAvailable: false,
  revenue: 0,
})
assert.equal(unavailable.breakEven, null)
assert.equal(unavailable.breakEvenStatus, 'UNAVAILABLE')
assert.equal(unavailable.target, null)
assert.equal(unavailable.targetStatus, 'UNAVAILABLE')
assert.equal(unavailable.revenue, 0)

console.log('Performance outlook presentation contract passed: authoritative values win, indicative break-even remains visible with explicit status, unavailable target is not rendered as zero, and real zero revenue remains zero.')
