import assert from 'node:assert/strict'
import fs from 'node:fs'

const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
const receiver = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeLifecycleRecoveryReceiver.java', 'utf8')
const gps = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsService.java', 'utf8')
const overlay = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8')

assert.match(manifest, /android.permission.RECEIVE_BOOT_COMPLETED/)
assert.match(manifest, /android:name=".KfeLifecycleRecoveryReceiver"/)
assert.match(manifest, /android.intent.action.BOOT_COMPLETED/)
assert.match(manifest, /android.intent.action.MY_PACKAGE_REPLACED/)
assert.match(receiver, /KfeNativeGpsService.resumePersisted(context)/)
assert.match(receiver, /KfeOverlayService.resumePersisted(context)/)
assert.match(gps, /NATIVE_GPS_RESUME/)
assert.match(gps, /getSharedPreferences(PREFS, MODE_PRIVATE).getString(ACTIVE_TRIP/)
assert.match(overlay, /KFE_OVERLAY_RESUME/)
assert.match(overlay, /getSharedPreferences("kfe_overlay",MODE_PRIVATE).getString(LAST_STATE_KEY/)
assert.match(gps, /START_STICKY/)
assert.match(overlay, /START_STICKY/)

console.log('Phase B Android lifecycle contract: reboot/package-replacement recovery is wired to persisted GPS and overlay state; no new workflow is synthesized.')
