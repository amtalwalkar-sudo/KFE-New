import assert from 'node:assert/strict'
import fs from 'node:fs'

const router = fs.readFileSync('src/router/index.js', 'utf8')
const shell = fs.readFileSync('src/components/shell/KfeShell.vue', 'utf8')
const performanceView = fs.readFileSync('src/views/PerformanceView.vue', 'utf8')
const performanceService = fs.readFileSync('src/application/performance/phaseOnePerformanceService.js', 'utf8')
const performanceStyles = fs.readFileSync('src/styles/performance.css', 'utf8')

assert.match(router, /path: '\/timeline', name: 'Timeline', component: ActivityTimelineView/)
assert.match(router, /path: '\/performance', name: 'Performance', component: PerformanceView/)
assert.match(router, /import PerformanceView from '\.\.\/views\/PerformanceView\.vue'/)
for (const label of ['Work', 'Timeline', 'Performance', 'Admin']) {
  assert.ok(shell.includes(`aria-label="${label}"`) || shell.includes(`<span>${label}</span>`), `bottom navigation retains ${label}`)
}
assert.match(performanceView, /PhaseOnePerformanceService\.getOverview\(period\.value\)/)
assert.match(performanceView, /onMounted\(\(\) => \{[\s\S]*?void load\(\)/, 'Performance must load a fresh canonical snapshot when entered')
assert.match(performanceView, /watch\(period, \(\) => \{ void load\(\{ force: true \}\) \}\)/, 'Changing the reporting period must reload the selected period')
assert.doesNotMatch(performanceView, /PhaseOnePerformanceService\.subscribeDataChanges/, 'Performance must not start overlapping IndexedDB reads from cross-tab echoes')
assert.match(performanceService, /PerformanceRepository\.getSnapshot\(\)/)
assert.match(performanceService, /calculateFuelPeriodSummary\(live\(snapshot\.fuelLogs\), effectiveRange\)/)
assert.match(performanceOverview, /incomeAfterFuel = recordedRevenue - fuelSpending/)
assert.doesNotMatch(performanceService, /import\s*\{\s*PerformanceService\s*\}|DriverTargetService|deriveOperatingKmForecast|deriveFinanceAwarePerformance/)
assert.match(performanceView, /Income after fuel/)
assert.match(performanceView, /Fare income/)
assert.match(performanceView, /Cancellation fees/)
assert.match(performanceView, /aria-label="Performance period"/)
assert.match(performanceStyles, /performance-metric-grid/)
assert.ok(fs.existsSync('src/application/timeline/activityTimelineReadService.js'))
assert.ok(fs.existsSync('src/views/ActivityTimelineView.vue'))
assert.ok(fs.existsSync('src/styles/activity-timeline.css'))
console.log('Timeline and Performance read-only routes contract: PASS')
