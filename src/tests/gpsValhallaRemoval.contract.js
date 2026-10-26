import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const absent = [
  'src/application/work/location.js',
  'src/application/work/locationProvider.js',
  'src/application/work/liveMovementTrace.js',
  'src/application/work/movementReconciliationQueue.js',
  'src/application/location/gpsStatusService.js',
  'src/infrastructure/android/nativeGpsService.js',
  'src/infrastructure/location/currentLocation.js',
  'src/infrastructure/location/deadKmPickupGpsService.js',
  'src/infrastructure/location/movementTraceService.js',
  'src/infrastructure/location/offlineMapService.js',
  'src/infrastructure/location/valhallaRoutingAdapter.js',
  'src/views/OfflineMapsView.vue',
  'android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsPlugin.java',
  'android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsService.java',
  'android/app/src/main/java/com/kanishka/pwa/KfeLocationProviderRecoveryReceiver.java',
  'android/app/src/main/java/com/kanishka/pwa/KfeOfflineMapsPlugin.java'
]
for (const path of absent) assert.equal(fs.existsSync(path), false, 'Removed GPS/Valhalla artifact must stay absent: ' + path)

const manifest = read('android/app/src/main/AndroidManifest.xml')
const gradle = read('android/app/build.gradle')
const capacitorGradle = read('android/app/capacitor.build.gradle')
const capacitorSettings = read('android/capacitor.settings.gradle')
const packageJson = read('package.json')
const lock = read('package-lock.json')
const mainActivity = read('android/app/src/main/java/com/kanishka/pwa/MainActivity.java')
const permissionGate = read('src/application/startup/permissionGate.js')
const workService = read('src/application/work/workService.js')
const ports = read('src/application/work/workRuntimePorts.js')
const adapter = read('src/infrastructure/work/workRuntimeAdapter.js')
const shell = read('src/components/shell/KfeShell.vue')
const store = read('src/stores/shiftTrip.js')
const overlay = read('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java')
const tripBoundary = read('src/application/work/tripBoundaryLocation.js')
const admin = read('src/views/AdminView.vue')

assert.match(manifest, /android\.permission\.ACCESS_FINE_LOCATION/)
assert.match(manifest, /android\.permission\.ACCESS_COARSE_LOCATION/)
assert.match(manifest, /FOREGROUND_SERVICE_LOCATION/)
assert.match(manifest, /foregroundServiceType="specialUse\|location"/)
assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION/)
assert.doesNotMatch(gradle, /play-services-location|valhalla-mobile|valhalla-models|osrm-openapi|moshi-kotlin|capawesome-team-capacitor-android-foreground-service/)
assert.doesNotMatch(capacitorGradle + capacitorSettings, /capawesome-team-capacitor-android-foreground-service/)
assert.doesNotMatch(packageJson + lock, /@capawesome-team\/capacitor-android-foreground-service/)
assert.match(mainActivity, /registerPlugin\(KfeNativeSystemPlugin\.class\)/)
assert.match(mainActivity, /registerPlugin\(KfeTripBoundaryLocationPlugin\.class\)/)
assert.doesNotMatch(mainActivity, /KfeNativeGpsPlugin|KfeNativeGpsService/)
assert.match(permissionGate, /registerPlugin\('KfeNativeSystem'\)/)
assert.doesNotMatch(permissionGate, /navigator\.geolocation|requestBrowserLocation|browserLocationPermission/)
const eventLocationService = read('src/application/location/eventLocationService.js')
assert.match(eventLocationService, /captureTripBoundaryLocation/, 'PWA event capture must use the shared one-shot GPS provider.')
assert.ok(workService.includes("captureAndPersistEventLocation('TRIP', result.id, 'TRIP_START'"), 'PWA ride start must persist through the shared event-location pathway.')
assert.ok(workService.includes("captureAndPersistEventLocation('TRIP', data?.id, 'TRIP_END'"), 'PWA ride end must persist through the shared event-location pathway.')
assert.doesNotMatch(workService, /captureAndPersistTripBoundary|persistTripBoundarySnapshot|updateTripBoundaryPlaceName/, 'WorkService must not use a separate trip-boundary location persistence path.')
assert.doesNotMatch(workService, /nativeGps|Valhalla|valhalla|captureLifecycleLocation|calculateTraceDistanceKm|MovementAccountingService|previewMovementReconciliation/)
assert.match(tripBoundary, /getCurrentPosition/)
assert.doesNotMatch(tripBoundary, /watchPosition|setInterval|Valhalla|routeTrace|fetch\(/)
assert.doesNotMatch(admin, /OfflineMapService|offline-map-region-picker|Download \/ Update Offline Maps/)
assert.doesNotMatch(ports + adapter, /movementTrace|nativeGps|routing|ValhallaRoutingAdapter|MovementTraceService|NativeGpsService/)
assert.doesNotMatch(shell, /gpsStatusService|header-gps|refreshGps|gpsState/)
assert.doesNotMatch(store, /MovementTraceService|lifecycleLocations|tripLocations|captureLocation|loadEntityLocations/)
assert.match(overlay, /captureOneShotTripBoundary/)
assert.match(overlay, /persistOneShotTripLocation/)
assert.match(overlay, /putRecord\(operationId,"GPS_SNAPSHOT",snapshot\)/, 'Native overlay must persist the same GPS_SNAPSHOT event model as the PWA.')
assert.doesNotMatch(overlay, /persistTripBoundarySnapshot\(/, 'Native overlay must not write a second location copy into the TRIP record.')
// A trip record is created before pickup; tripStartLocation must represent the actual RIDE_STARTED boundary.
const pwaTripCreation = workService.slice(workService.indexOf('async startTrip(data)'), workService.indexOf('async startRide(data)'))
const pwaRideStart = workService.slice(workService.indexOf('async startRide(data)'), workService.indexOf('async completeTrip(data)'))
assert.doesNotMatch(pwaTripCreation, /tripStartLocation/, 'The start snapshot must not be captured when only heading to pickup.')
assert.match(pwaRideStart, /captureAndPersistEventLocation\('TRIP', result\.id, 'TRIP_START'/, 'The PWA start snapshot must be captured after the ride enters RIDE_STARTED.')
const nativePickupTransition = overlay.slice(overlay.indexOf('if("GO_TO_PICKUP".equals(actionStage)){'), overlay.indexOf('if("START_RIDE".equals(actionStage)){'))
const nativeRideStart = overlay.slice(overlay.indexOf('if("START_RIDE".equals(actionStage)){'), overlay.indexOf('if("END_RIDE".equals(actionStage)){'))
assert.doesNotMatch(nativePickupTransition, /tripStartLocation/, 'Native start snapshot must not be captured while going to pickup.')
assert.match(nativeRideStart, /captureOneShotTripBoundary\(pendingTripId, "TRIP_START"\)/, 'Native start snapshot must be captured on the durable START_RIDE transition.')
assert.doesNotMatch(overlay, /requestLocationUpdates|startLocationUpdates|ValhallaRoutingAdapter|routeTrace/)

console.log('GPS tracking and Valhalla removal contract: PASS — one-shot trip-boundary snapshots remain; continuous tracking and routing are absent.')
