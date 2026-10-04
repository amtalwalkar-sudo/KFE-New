import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const admin = read('../views/AdminView.vue')
const performance = read('../views/PerformanceView.vue')
const timeline = read('../views/TimelineView.vue')
const work = read('../views/WorkModuleView.vue')
const overlay = read('../infrastructure/android/kfeOverlay.js')
const performanceService = read('../application/performance/performanceService.js')
const performanceEngine = read('../domain/performance/performanceEngineV2.js')
const timelineService = read('../application/timeline/timelineService.js')
const workService = read('../application/work/workService.js')
const register = read('../../KFE_BUSINESS_RULES_REGISTER.md')
const matrix = read('../../docs/CALCULATION-AUTHORITY-MATRIX.md')

const surfaces = { admin, performance, timeline, work, overlay, performanceService, performanceEngine, timelineService, workService }

const figures = [
  { id: 'D-01 Revenue', canonical: [/authoritativeRevenue/, /shifts\\.revenue/], displays: { timeline: [/authoritativeRevenue/, /Authoritative Revenue/], performance: [/m\\.value\\.revenue/, /Financial revenue/], work: [/shiftRevenue/, /Shift revenue/] } },
  { id: 'D-02 Vehicle KM', canonical: [/vehicleKm/], displays: { performance: [/m\\.value\\.vehicleKm/, /Vehicle KM/], work: [/shiftKm/, /Total shift KM/] } },
  { id: 'D-03 Business KM', canonical: [/businessKm/], displays: { timeline: [/businessKm/], performance: [/businessKm/, /Business KM/], work: [/reviewedTripKm/, /Trip KM/] } },
  { id: 'D-04 Dead KM', canonical: [/deadKm/], displays: { performance: [/deadKm/, /Dead KM/], work: [/reviewedDeadKm/, /Dead KM/] } },
  { id: 'D-05 Fuel', canonical: [/fuelQty/, /fuelCost/], displays: { timeline: [/fuelQuantityKg/, /fuelCost/, /CNG Refuelling/], performance: [/fuelQty/, /fuelCost/, /Fuel economy/], work: [/fuelQty/, /fuelPrice/, /fuelAmount/, /Partial fill/] } },
  { id: 'D-06 Operating Cost', canonical: [/actualOperatingCost/], displays: { performance: [/actualOperatingCost/, /Operating cost/], admin: [/period\\?\\.costsPaise/, /Business Cost/] } },
  { id: 'D-07 Operating Profit', canonical: [/operatingProfit/], displays: { performance: [/actualOperatingCost/, /Actual profit \\/ loss/], admin: [/period\\?\\.profitPaise/, /Profit/] } },
  { id: 'D-08 Actual P\\/L', canonical: [/performanceHeadlineActualProfit/, /actualLoanPaid/], displays: { performance: [/performanceHeadlineActualProfit/, /Actual P\\/L \\(includes actual EMI\\/loan payments\\)/] } },
  { id: 'D-09 Provisional P\\/L', canonical: [/performanceHeadlineProvisionalProfit/, /totalIndicativeProvision/], displays: { performance: [/performanceHeadlineProvisionalProfit/, /Provisional profit \\/ loss/] } },
  { id: 'D-10 Break-even', canonical: [/monthlyBreakEvenRevenue/, /AUTHORITATIVE_MONTHLY_BREAK_EVEN/], displays: { performance: [/monthlyBreakEvenRevenue/, /Break-even/], admin: [/breakEvenPaise/, /Break-even/] } },
  { id: 'D-11 Driver Target', canonical: [/driverTargetEffectiveMonthlyTarget/, /driverTarget/], displays: { performance: [/driverTargetEffectiveMonthlyTarget/, /Daily target/], work: [/targetValue/, /TODAY'S TARGET/], timeline: [/target\\?\\.target/, /Target/] } },
  { id: 'D-12 Loan Position', canonical: [/actualLoanPaid/, /outstandingPrincipal/, /totalOverdue/], displays: { performance: [/actualLoanPaid/, /Outstanding principal/], admin: [/deriveLoanPosition/, /loan/] } },
  { id: 'D-13 Trip Fare / Cancellation', canonical: [/tripRevenue|revenue/, /cancelFare|cancelledRevenue/], displays: { timeline: [/Cancellation fee/, /Fare/], work: [/fare/, /cancelFare/, /Cancellation fee/] } },
]

assert.match(register, /One business fact has one authoritative source and one canonical calculation path/)
assert.match(register, /many presentation surfaces/)
assert.match(matrix, /UI boundary/)
assert.match(matrix, /Data freshness contract/)

for (const figure of figures) {
  const canonicalSources = { performanceService, performanceEngine, timelineService, workService, matrix }
  for (const pattern of figure.canonical) assert.ok(Object.values(canonicalSources).some(source => pattern.test(source)), `${figure.id}: canonical evidence missing ${pattern}`)
  for (const [surface, patterns] of Object.entries(figure.displays)) {
    const source = surfaces[surface]
    assert.ok(source, `${figure.id}: unknown surface ${surface}`)
    for (const pattern of patterns) assert.match(source, pattern, `${figure.id}: ${surface} binding missing ${pattern}`)
  }
}

assert.match(overlay, /KfeOverlay\\.update\\(\\{ state: JSON\\.stringify\\(state\\) \\}\\)/)
assert.doesNotMatch(overlay, /deriveAuthoritativeBreakEven|calculateEmi|PerformanceService/)
assert.match(work, /AndroidOverlay\\.update\\(/)
assert.match(work, /deriveWorkCockpitState\\(/)
assert.match(performanceService, /subscribeCanonicalDataChanges/)
assert.match(performanceService, /PerformanceRepository\\.getSnapshot/)
assert.match(performanceService, /normalizeCalculationSnapshot/)
assert.match(timelineService, /ShiftTripRepository\\.getAllShifts/)
assert.match(timelineService, /OperationalRecordService\\.reconstructShift/)
assert.match(timelineService, /authoritativeRevenue: sum\\(records\\.filter\\(record => completed\\(record\\.shift\\)\\)/)

console.log('Phase D cross-surface/display audit contract: PASS')
console.log(JSON.stringify({ figures: figures.length, chain: 'Admin/canonical record -> calculation -> Timeline -> Performance -> Work -> Overlay', verification: 'source-level bindings + authority/non-duplication guards', device: 'excluded' }))
