import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const exists = path => assert.ok(fs.existsSync(path), `Missing authoritative application path: ${path}`)

const work = read('src/views/WorkModuleView.vue')
const timeline = read('src/views/ActivityTimelineView.vue')
const performance = read('src/views/PerformanceView.vue')
const admin = read('src/views/AdminView.vue')
const timelineRead = read('src/application/timeline/activityTimelineReadService.js')
const locationService = read('src/application/location/eventLocationService.js')

for (const path of [
  'src/application/work/workService.js',
  'src/application/timeline/activityTimelineReadService.js',
  'src/application/performance/phaseOnePerformanceService.js',
  'src/application/performance/performanceService.js',
  'src/application/performance/driverTargetService.js',
  'src/application/admin/adminService.js',
  'src/application/admin/adminReadModelService.js',
  'src/repositories/shiftTripRepository.js',
  'src/repositories/fuelRepository.js',
  'src/repositories/locationRepository.js',
  'src/domain/work/tripLifecycle.js',
  'src/domain/finance/loanEngine.js',
  'src/domain/performance/calculationAuthority.js',
]) exists(path)

// Each production screen delegates durable operations/read models to application
// services. Presentation files must not create their own IndexedDB authority.
assert.match(work, /WorkService/)
assert.match(work, /PerformanceService/)
assert.match(timeline, /ActivityTimelineReadService/)
assert.match(performance, /PhaseOnePerformanceService/)
assert.match(admin, /AdminService/)
assert.match(admin, /AdminReadModelService/)
for (const [name, source] of [['Work', work], ['Timeline', timeline], ['Performance', performance], ['Admin', admin]]) {
  assert.doesNotMatch(source, /indexedDB|objectStore\s*\(/, `${name} view must not own persistence`)
}
assert.doesNotMatch(admin, /createRide|createShift|driverCollectedData/, 'Admin must not create operational Work records')

// Timeline is a read projection. Network locality resolution is allowed only
// through the explicit user pull-down gesture; read-model refresh stays cache-only.
assert.match(timelineRead, /getCachedLocationName/)
assert.doesNotMatch(timelineRead, /resolveLocationName|fetch\s*\(|reverseGeocod|navigator\.onLine/)
assert.match(timeline, /@touchstart\.passive="onTouchStart"/)
assert.match(timeline, /@touchend\.passive="onTouchEnd"/)
assert.match(timeline, /resolveLocationNameDetailed/)
assert.match(timeline, /refreshLocationNames/)
assert.match(timeline, /navigator\.onLine/)
assert.match(locationService, /const RIDE_EVENTS = new Set\(\['PICKUP_START', 'TRIP_CANCELLED', 'TRIP_START', 'TRIP_END'\]\)/)
assert.doesNotMatch(locationService, /setInterval|setTimeout\s*\(/, 'GPS capture service must not poll or retry automatically')

// Presentation uses service/domain results rather than becoming a competing
// business-rule owner for calculations.
assert.match(performance, /overview\.incomeAfterFuel/)
assert.match(performance, /overview\.fuelCostPerKm/)
assert.match(timeline, /snapshot\.fuelSummary/)
assert.match(admin, /AdminService/)

console.log('KFE Phase 6 application-flow ownership contract: PASS')
