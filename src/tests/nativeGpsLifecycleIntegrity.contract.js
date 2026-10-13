import { assessGpsTraceCompleteness } from '../domain/movement/movementAccounting.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
const service = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsService.java', 'utf8')
const plugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsPlugin.java', 'utf8')
const bridge = fs.readFileSync('src/infrastructure/android/nativeGpsService.js', 'utf8')
const tripRepository = fs.readFileSync('src/repositories/shiftTripRepository.js', 'utf8')
const work = fs.readFileSync('src/application/work/workService.js', 'utf8')

assert.match(manifest, /\.KfeNativeGpsService[^\n]*android:stopWithTask="false"[^\n]*android:foregroundServiceType="location"/)
assert.match(manifest, /android\.permission\.RECEIVE_BOOT_COMPLETED/)
assert.match(manifest, /android\.permission\.ACCESS_BACKGROUND_LOCATION/)
assert.match(manifest, /android\.permission\.WAKE_LOCK/)
assert.match(service, /PowerManager\.PARTIAL_WAKE_LOCK/)
assert.match(service, /acquireLocationWakeLock\(\)/)
assert.match(service, /releaseLocationWakeLock\(\)/)
assert.match(service, /startForeground\(NOTIFICATION_ID, notification, ServiceInfo\.FOREGROUND_SERVICE_TYPE_LOCATION\)/)
assert.match(service, /START_STICKY/)
assert.match(service, /resumePersisted\(Context context\)/)
assert.match(service, /output\.getFD\(\)\.sync\(\)/, 'native raw trace must be fsynced')
assert.match(service, /isPersistedTracking\(Context context, String id, String requestedEventType, String requestedEntityType\)/)
assert.match(plugin, /awaitCollectorState\(call, tripId, eventType, entityType, true/)
assert.match(plugin, /awaitCollectorState\(call, tripId, null, null, false/)
assert.match(plugin, /NATIVE_GPS_START_NOT_CONFIRMED/)
assert.match(plugin, /NATIVE_GPS_STOP_NOT_CONFIRMED/)
assert.match(tripRepository, /async invalidateGpsTripMovement/)
assert.match(tripRepository, /record\.tripKm = null/)
assert.match(tripRepository, /record\.tripKmAuthority = 'GPS_TRACE_INCOMPLETE'/)

assert.match(bridge, /async syncTrace\(tripId, \{ entityType = 'TRIP', clearAfterImport = false \} = \{\}\)/)
assert.match(bridge, /NATIVE_GPS_TRACE_IMPORT_VERIFICATION_FAILED; raw evidence retained/)
assert.match(bridge, /await LocationRepository\.forEntity\(entityType, tripId\)[\s\S]*?if \(clearAfterImport\)[\s\S]*?await NativeGps\.clearTrace/)
assert.match(bridge, /async stop\(tripId\)[\s\S]*?await NativeGps\.stop\(\{ tripId \}\)[\s\S]*?return true/)

const completeTripStart = work.indexOf('async completeTrip(data)')
const completeTripEnd = work.indexOf('async cancelTrip(data)', completeTripStart)
assert.ok(completeTripStart >= 0 && completeTripEnd > completeTripStart, 'completeTrip implementation must exist')
const completeTrip = work.slice(completeTripStart, completeTripEnd)
assert.ok(completeTrip.indexOf('await WorkRuntimePorts.nativeGps.stop(tripId)') < completeTrip.indexOf('WorkRuntimePorts.nativeGps.syncTrace(tripId, { clearAfterImport: true })'), 'trip completion must stop/ack collector before importing and clearing trace')
const cancelTripStart = work.indexOf('async cancelTrip(data)')
const cancelTripEnd = work.indexOf('async updateTrip(data)', cancelTripStart)
const cancelTrip = work.slice(cancelTripStart, cancelTripEnd)
assert.ok(cancelTrip.indexOf('await WorkRuntimePorts.nativeGps.stop(data.id)') < cancelTrip.indexOf('WorkRuntimePorts.nativeGps.syncTrace(data.id, { clearAfterImport: true })'), 'trip cancellation must stop/ack collector before importing and clearing trace')

const startAt = '2026-10-13T10:00:00.000Z'
const endAt = '2026-10-13T10:02:00.000Z'
const completeTrace = [
  { latitude: 19.01, longitude: 72.85, accuracy: 8, capturedAt: '2026-10-13T10:00:05.000Z' },
  { latitude: 19.02, longitude: 72.86, accuracy: 8, capturedAt: '2026-10-13T10:01:00.000Z' },
  { latitude: 19.03, longitude: 72.87, accuracy: 8, capturedAt: '2026-10-13T10:01:55.000Z' }
]
assert.equal(assessGpsTraceCompleteness(completeTrace, { startAt, endAt }).complete, true)
const staleEndingTrace = completeTrace.map(point => ({ ...point }))
staleEndingTrace[1].capturedAt = '2026-10-13T10:00:20.000Z'
staleEndingTrace[2].capturedAt = '2026-10-13T10:00:25.000Z'
const staleQuality = assessGpsTraceCompleteness(staleEndingTrace, { startAt, endAt })
assert.equal(staleQuality.complete, false)
assert.equal(staleQuality.reason, 'GPS_TRACE_END_GAP', 'a trace that stops long before trip end must not produce a trusted trip KM')
assert.equal(assessGpsTraceCompleteness(completeTrace.slice(0, 2), { startAt, endAt }).reason, 'TOO_FEW_USABLE_GPS_POINTS')

console.log('Native GPS lifecycle integrity contract passed.')
