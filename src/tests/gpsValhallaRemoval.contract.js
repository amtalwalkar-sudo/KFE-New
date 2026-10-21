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

assert.doesNotMatch(manifest, /ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|ACCESS_BACKGROUND_LOCATION|foregroundServiceType="location"/)
assert.doesNotMatch(gradle, /play-services-location|valhalla-mobile|valhalla-models|osrm-openapi|moshi-kotlin|capawesome-team-capacitor-android-foreground-service/)
assert.doesNotMatch(capacitorGradle + capacitorSettings, /capawesome-team-capacitor-android-foreground-service/)
assert.doesNotMatch(packageJson + lock, /@capawesome-team\/capacitor-android-foreground-service/)
assert.match(mainActivity, /registerPlugin\(KfeNativeSystemPlugin\.class\)/)
assert.doesNotMatch(mainActivity, /KfeNativeGpsPlugin|KfeNativeGpsService/)
assert.match(permissionGate, /registerPlugin\('KfeNativeSystem'\)/)
assert.doesNotMatch(permissionGate, /navigator\.geolocation|requestBrowserLocation|browserLocationPermission/)
assert.doesNotMatch(workService, /nativeGps|Valhalla|valhalla|captureLifecycleLocation|calculateTraceDistanceKm|MovementAccountingService|previewMovementReconciliation/)
assert.doesNotMatch(ports + adapter, /movementTrace|nativeGps|routing|ValhallaRoutingAdapter|MovementTraceService|NativeGpsService/)
assert.doesNotMatch(shell, /gpsStatusService|header-gps|refreshGps|gpsState/)
assert.doesNotMatch(store, /MovementTraceService|lifecycleLocations|tripLocations|captureLocation|loadEntityLocations/)
assert.doesNotMatch(overlay, /captureOneShotTripBoundary|persistOneShotTripLocation|LocationManager|android\.location\.Location/)

console.log('GPS tracking and Valhalla removal contract: PASS')
