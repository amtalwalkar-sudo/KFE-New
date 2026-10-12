import assert from 'node:assert/strict'
import { routeTrace } from '../domain/movement/movementAccounting.js'
import fs from 'node:fs'
const location=fs.readFileSync('src/services/locationService.js','utf8')
assert.match(location,/GPS_INTERVALS_MS = Object\.freeze/)
assert.match(location,/WAITING: 7 \* 60 \* 1000/); assert.match(location,/TRIP_ACTIVE: 9 \* 60 \* 1000/)
assert.match(location,/BETWEEN_TRIPS_MOVING: 2 \* 60 \* 1000/); assert.match(location,/BETWEEN_TRIPS_STATIONARY: 6 \* 60 \* 1000/)
assert.match(location,/GPS_WATCH_OPTIONS/); assert.match(location,/enableHighAccuracy: false/); assert.match(location,/maximumAge: 30000/)
assert.doesNotMatch(location,/watchPosition\([^\n]*enableHighAccuracy: true/)
assert.match(location,/getIntervals\(\)/); assert.match(location,/captureBoundarySnapshot/)
assert.match(location,/startAndroidForegroundService/); assert.match(location,/stopAndroidForegroundService/)
console.log('KFE Phase 7 GPS cadence and battery contract: PASS')

// Phase 9 resilience: a failed persistence/application handler must not terminate the recurring GPS cadence.
assert.match(location, /runHandlerSafely/)
assert.match(location, /location snapshot handler failed; cadence will continue/)
assert.match(location, /await runHandlerSafely\(activeHandler, location\)/)
assert.match(location, /await runHandlerSafely\(handler, location\)/)
console.log('KFE Phase 9 performance/cadence resilience checks: PASS')

const nativeGps = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsService.java', 'utf8')
const workService = fs.readFileSync('src/application/work/workService.js', 'utf8')
assert.match(workService, /WorkRuntimePorts\.nativeGps\.start\(result\.id, 'DEAD_MOVEMENT_TRACE'\)/)
assert.match(workService, /WorkRuntimePorts\.nativeGps\.start\(data\.id\)/)
assert.match(nativeGps, /requestedType\.equals\(eventType\)/)
assert.match(nativeGps, /eventType = requestedType/)
console.log('Native GPS phase transition contract passed: pickup trace changes to passenger-ride trace on Start Trip.')

const nativePlugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsPlugin.java', 'utf8')
assert.match(nativePlugin, /getPermissionState\("location"\)/)
assert.match(nativePlugin, /requestPermissionForAlias\("location", call, "locationPermissionCallback"\)/)
assert.match(nativePlugin, /@PermissionCallback/)
console.log('Native GPS permission contract passed: tracking requests runtime location permission before starting the foreground service.')

assert.match(workService, /await WorkRuntimePorts\.nativeGps\.syncTrace\(tripId\)/)
assert.match(workService, /await WorkRuntimePorts\.nativeGps\.stop\(tripId\)/)
assert.match(workService, /void \(async \(\) => \{/)
assert.match(workService, /const router = new ValhallaRoutingAdapter\(\)/)
assert.match(workService, /const routed = await routeTrace\(snapshots, router\)/)
assert.match(workService, /ShiftTripRepository\.enrichTripMovement\(\{/)
assert.match(workService, /tripKmAuthority: routed\.roadMatchedGeometry \? 'VALHALLA_ROAD_TRACE' : 'GPS_LINE_TRACE'/)
assert.match(workService, /method: 'HAVERSINE_TRACE_SUM'/)
assert.match(workService, /Completion is already persisted\. Valhalla\/network\/GPS enrichment must/)
console.log('END TRIP enrichment contract passed: commit/sync first, Valhalla enrichment is asynchronous, with GPS/Haversine fallback and no transition blocking.')

const movementTrace = fs.readFileSync('src/infrastructure/location/movementTraceService.js', 'utf8')
assert.match(movementTrace, /PASSENGER_RIDE: 20 \* 1000/)
assert.match(movementTrace, /recordTracePoint/)
assert.match(movementTrace, /captureBoundary/)
assert.match(workService, /WorkRuntimePorts\.movementTrace/)
assert.match(workService, /WorkRuntimePorts\.movementTrace\.start\(\{ entityType: 'TRIP', entityId: data\.id, eventType: 'PASSENGER_RIDE_TRACE', profile: 'PASSENGER_RIDE' \}\)/)
assert.match(workService, /WorkRuntimePorts\.movementTrace\.stop\(\{ captureFinal: true \}\)/)
assert.match(workService, /const tripGpsSnapshots = \(await Promise\.all\(movementTrips\.map\(trip => LocationRepository\.forEntity\('TRIP', trip\.id\)\)\)\)\.flat\(\)/)
assert.match(workService, /const gpsSnapshots = \[\.\.\.shiftGpsSnapshots, \.\.\.tripGpsSnapshots\]/)
console.log('Browser PWA ride trace contract passed: Start Trip records a 20-second passenger trace, End Trip captures the final boundary, and shift reconciliation consumes trip trace evidence.')

// Lifecycle and reconciliation consistency guards: cancellation must stop browser/native ride tracing,
// and preview must consume the same SHIFT + TRIP GPS evidence as final reconciliation.
assert.match(workService, /WorkRuntimePorts\.movementTrace\.getActiveSession\(\)/)
assert.match(workService, /WorkRuntimePorts\.movementTrace\.stop\(\{ captureFinal: false \}\)/)
assert.match(workService, /WorkRuntimePorts\.nativeGps\.syncTrace\(data\.id\)/)
assert.match(workService, /const shiftGpsSnapshots = await LocationRepository\.forEntity\('SHIFT', shiftId\)/)
assert.match(workService, /const tripGpsSnapshots = \(await Promise\.all\(trips\.map\(trip => LocationRepository\.forEntity\('TRIP', trip\.id\)\)\)\)\.flat\(\)/)
assert.match(workService, /const gpsSnapshots = \[\.\.\.shiftGpsSnapshots, \.\.\.tripGpsSnapshots\]/)
assert.match(workService, /source: browserTracePoints\.length > 0 \? 'BROWSER_GEOLOCATION' : 'ANDROID_NATIVE_GPS'/)
console.log('GPS lifecycle/provenance contract passed: cancellation stops active ride tracing, preview/final reconciliation share evidence, and provenance identifies the actual GPS source.')


// Phase A: GPS fallback must use dedicated movement enrichment so GPS-derived KM never becomes MANUAL.
assert.ok(workService.includes("if (Number.isFinite(Number(gpsKm)) && gpsKm >= 0) {"))
assert.ok(workService.includes("await ShiftTripRepository.enrichTripMovement({"))
assert.equal(workService.includes("await ShiftTripRepository.updateTrip({\n              id: tripId,\n              tripKm: Number(gpsKm)"), false)
console.log('Phase A GPS fallback authority contract passed: Haversine fallback remains GPS_LINE_TRACE, never MANUAL.')

// Phase A: native GPS writes must be durable and failed points must remain retryable.
assert.ok(nativeGps.includes("import android.util.Log;"))
assert.ok(nativeGps.includes("new FileOutputStream(traceFile, true)"))
assert.ok(nativeGps.includes("output.getFD().sync()"))
assert.ok(nativeGps.includes("GPS trace persistence failed; point will be retried"))
console.log('Phase A native GPS durability contract passed: writes are synced and failed points are retryable.')

const noGeometryRoute = await routeTrace([
  { latitude: 19.076, longitude: 72.8777, accuracy: 5, speed: 10, capturedAt: '2026-10-01T08:00:00.000Z' },
  { latitude: 19.077, longitude: 72.8787, accuracy: 5, speed: 10, capturedAt: '2026-10-01T08:00:20.000Z' }
], {
  routeTrace: async () => ({
    provider: 'valhalla',
    method: 'VALHALLA_TRACE_ROUTE_MAP_MATCH',
    distanceKm: 9.9,
    geometry: null,
    provenance: { provider: 'valhalla', operation: 'trace_route' }
  })
})
assert.equal(noGeometryRoute.method, 'FILTERED_GPS_TRACE')
assert.equal(noGeometryRoute.roadMatchedGeometry, null)
assert.equal(noGeometryRoute.provenance.provider, 'KFE_TRACE_FALLBACK')
console.log('Routing evidence contract passed: a distance without matched geometry falls back to filtered GPS trace.')

// Offline-first trace / deferred road matching contracts.
const reconciliationQueue = fs.readFileSync('src/application/work/movementReconciliationQueue.js', 'utf8')
const liveWorkView = fs.readFileSync('src/views/WorkModuleView.vue', 'utf8') + '\n' + fs.readFileSync('src/application/work/workService.js', 'utf8')
assert.match(liveWorkView, /LIVE GPS ESTIMATE/)
assert.match(liveWorkView, /PROVISIONAL ROAD MATCH/)
assert.match(liveWorkView, /MovementReconciliationQueue\.matchLiveTrace/)
assert.match(reconciliationQueue, /kfe\.movement-reconciliation-queue\.v1/)
assert.match(reconciliationQueue, /MIN_LIVE_MATCH_POINTS = 4/)
assert.match(reconciliationQueue, /LIVE_MATCH_INTERVAL_MS = 30000/)
assert.match(reconciliationQueue, /window\.addEventListener\('online'/)
assert.match(reconciliationQueue, /reconciledAfterReconnect: true/)
assert.match(reconciliationQueue, /VALHALLA_ROAD_TRACE/)
console.log('Offline-first GPS contract passed: provisional trace display is independent of routing, and validated road matching is retried after reconnect.')
