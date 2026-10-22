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
const nativeTripBoundary = read('android/app/src/main/java/com/kanishka/pwa/KfeTripBoundaryLocationPlugin.java')
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
assert.match(workService, /captureTripBoundaryLocation/)
assert.doesNotMatch(workService, /nativeGps|Valhalla|valhalla|captureLifecycleLocation|calculateTraceDistanceKm|MovementAccountingService|previewMovementReconciliation/)
assert.match(tripBoundary, /getCurrentPosition/)
assert.doesNotMatch(tripBoundary, /watchPosition|setInterval|Valhalla|routeTrace|fetch\(/)
assert.match(tripBoundary, /if \(!Number\.isFinite\(date\.getTime\(\)\) \|\| date\.getTime\(\) <= 0\) return null/)
assert.doesNotMatch(tripBoundary, /position\.timestamp \|\| Date\.now\(\)|capturedAt: capturedAt \|\| new Date\(\)\.toISOString\(\)/, 'A missing GPS fix timestamp must not be replaced with the current wall-clock time.')
assert.match(nativeTripBoundary, /location\.getTime\(\) > 0L \? Instant\.ofEpochMilli\(location\.getTime\(\)\)\.toString\(\) : JSObject\.NULL/, 'Native snapshots must preserve the provider fix timestamp and not fabricate one.')
assert.doesNotMatch(admin, /OfflineMapService|offline-map-region-picker|Download \/ Update Offline Maps/)
assert.doesNotMatch(ports + adapter, /movementTrace|nativeGps|routing|ValhallaRoutingAdapter|MovementTraceService|NativeGpsService/)
assert.doesNotMatch(shell, /gpsStatusService|header-gps|refreshGps|gpsState/)
assert.doesNotMatch(store, /MovementTraceService|lifecycleLocations|tripLocations|captureLocation|loadEntityLocations/)
assert.match(overlay, /captureOneShotTripBoundary/)
assert.match(overlay, /persistOneShotTripLocation/)
assert.doesNotMatch(overlay, /requestLocationUpdates|startLocationUpdates|ValhallaRoutingAdapter|routeTrace/)

console.log('GPS tracking and Valhalla removal contract: PASS — one-shot trip-boundary snapshots remain; continuous tracking and routing are absent; fix timestamps are never fabricated.')
