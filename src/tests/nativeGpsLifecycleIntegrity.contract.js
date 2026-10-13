import assert from 'node:assert/strict'
import fs from 'node:fs'

const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
const service = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsService.java', 'utf8')
const plugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsPlugin.java', 'utf8')
const bridge = fs.readFileSync('src/infrastructure/android/nativeGpsService.js', 'utf8')
const work = fs.readFileSync('src/application/work/workService.js', 'utf8')

assert.match(manifest, /\.KfeNativeGpsService[^\n]*android:stopWithTask="false"[^\n]*android:foregroundServiceType="location"/)
assert.match(manifest, /android\.permission\.RECEIVE_BOOT_COMPLETED/)
assert.match(manifest, /android\.permission\.ACCESS_BACKGROUND_LOCATION/)
assert.match(service, /startForeground\(NOTIFICATION_ID, notification, ServiceInfo\.FOREGROUND_SERVICE_TYPE_LOCATION\)/)
assert.match(service, /START_STICKY/)
assert.match(service, /resumePersisted\(Context context\)/)
assert.match(service, /output\.getFD\(\)\.sync\(\)/, 'native raw trace must be fsynced')
assert.match(service, /isPersistedTracking\(Context context, String id, String requestedEventType, String requestedEntityType\)/)
assert.match(plugin, /awaitCollectorState\(call, tripId, eventType, entityType, true/)
assert.match(plugin, /awaitCollectorState\(call, tripId, null, null, false/)
assert.match(plugin, /NATIVE_GPS_START_NOT_CONFIRMED/)
assert.match(plugin, /NATIVE_GPS_STOP_NOT_CONFIRMED/)

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

console.log('Native GPS lifecycle integrity contract passed.')
