import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const exists = path => assert.ok(fs.existsSync(path), `Missing in-scope path: ${path}`)
const work = read('src/views/WorkModuleView.vue')
const timeline = read('src/views/ActivityTimelineView.vue')
const performance = read('src/views/PerformanceView.vue')
const admin = read('src/views/AdminView.vue')
const timelineRead = read('src/application/timeline/activityTimelineReadService.js')
const locationService = read('src/application/location/eventLocationService.js')
const locationNames = read('src/infrastructure/location/localityResolutionAdapter.js')
const locationNamePort = read('src/application/location/locationNameService.js')
const businessRules = read('KFE_BUSINESS_RULES_REGISTER.md')
const architecture = read('docs/KFE-ARCHITECTURE-CONTRACT.md')

for (const path of [
  'src/application/work/workService.js',
  'src/application/timeline/activityTimelineReadService.js',
  'src/application/performance/phaseOnePerformanceService.js',
  'src/application/admin/adminService.js',
  'src/repositories/shiftTripRepository.js',
  'src/repositories/fuelRepository.js',
  'src/repositories/locationRepository.js',
  'src/domain/work/tripLifecycle.js',
  'src/infrastructure/android/nativeCanonicalWork.js',
  'android/app/src/main/java/com/kanishka/pwa/KfeTripBoundaryLocationPlugin.java',
]) exists(path)

assert.match(work, /WorkService/)
assert.match(timeline, /ActivityTimelineReadService/)
assert.match(performance, /PhaseOnePerformanceService/)
assert.match(admin, /AdminService/)
assert.match(businessRules, /Basic Performance/)
assert.match(businessRules, /PICKUP_START/)
assert.match(businessRules, /manual-only/)
assert.match(architecture, /Capacitor\/native boundary/)
assert.match(architecture, /Basic Performance calculation boundary/)
for (const [name, source] of [['Work', work], ['Timeline', timeline], ['Performance', performance], ['Admin', admin]]) {
  assert.doesNotMatch(source, /indexedDB|objectStore\s*\(/, `${name} view must not own persistence`)
}
assert.doesNotMatch(admin, /driverTarget|maintenanceRate|prepayment|amortization|break.?even|provision/i, 'Admin must not expose retired calculation workflows')
assert.doesNotMatch(performance, /forecast|break.?even|provision|amortization|driver target/i, 'Performance must stay within basic recorded-data scope')

assert.match(timelineRead, /getCachedLocationName/)
assert.doesNotMatch(timelineRead, /resolveLocationName|fetch\s*\(|reverseGeocod|navigator\.onLine/)
assert.match(timeline, /@touchstart\.passive="onTouchStart"/)
assert.match(timeline, /@touchend\.passive="onTouchEnd"/)
assert.match(timeline, /resolveLocationNameDetailed/)
assert.match(timeline, /refreshLocationNames/)
assert.match(timeline, /navigator\.onLine/)
assert.match(locationService, /const RIDE_EVENTS = new Set\(\['PICKUP_START', 'TRIP_CANCELLED', 'TRIP_START', 'TRIP_END'\]\)/)
assert.doesNotMatch(locationService, /setInterval|setTimeout\s*\(/, 'GPS capture service must not poll or retry automatically')
assert.doesNotMatch(locationNames, /RETRY_SCHEDULED/, 'locality lookup must not claim an automatic retry is scheduled')
assert.doesNotMatch(locationNamePort, /fetch\s*\(|localStorage|navigator\.geolocation/, 'application locality port must not own network, cache, or GPS acquisition')
assert.match(locationNames, /if \(forceRefresh && this\.cacheEnabled && cache\[key\]\)/, 'failed manual refresh must invalidate stale cached locality labels')
assert.match(performance, /overview\.incomeAfterFuel/)
assert.match(performance, /overview\.fuelCostPerKm/)
assert.match(timeline, /snapshot\.fuelSummary/)
console.log('KFE in-scope application-flow ownership contract: PASS')
