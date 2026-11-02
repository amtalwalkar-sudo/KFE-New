import assert from 'node:assert/strict'
import fs from 'node:fs'

const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
const receiver = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeLifecycleRecoveryReceiver.java', 'utf8')
const gpsPlugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeTripBoundaryLocationPlugin.java', 'utf8')
const overlay = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8')

assert.match(manifest, /android.permission.RECEIVE_BOOT_COMPLETED/)
assert.match(manifest, /android:name=".KfeLifecycleRecoveryReceiver"/)
assert.match(manifest, /android.intent.action.BOOT_COMPLETED/)
assert.match(manifest, /android.intent.action.MY_PACKAGE_REPLACED/)
assert.match(receiver, /KfeOverlayService.resumePersisted\(context\)/)
assert.doesNotMatch(receiver, /KfeNativeGpsService|resumePersistedGps/)
assert.match(gpsPlugin, /PICKUP_START/)
assert.match(gpsPlugin, /TRIP_CANCELLED/)
assert.match(gpsPlugin, /TRIP_START/)
assert.match(gpsPlugin, /TRIP_END/)
assert.match(gpsPlugin, /queueEventLocationCapture/)
assert.doesNotMatch(gpsPlugin, /startForeground|requestLocationUpdates/)
assert.match(overlay, /retryPendingLocations/)
assert.match(overlay, /pendingEventLocationCount/)

console.log('Phase B Android lifecycle contract: only persisted overlay state is resumed; GPS remains event-bound, one-shot and non-continuous.')
