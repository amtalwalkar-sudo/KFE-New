import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(path, 'utf8')
const manifest = read('android/app/src/main/AndroidManifest.xml')
const activity = read('android/app/src/main/java/com/kanishka/pwa/MainActivity.java')
const overlay = read('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java')
const overlayPlugin = read('android/app/src/main/java/com/kanishka/pwa/KfeOverlayPlugin.java')
const notifications = read('android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationsPlugin.java')
const receiver = read('android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationReceiver.java')
const js = read('src/infrastructure/android/kfeRideNotificationService.js')
const gradle = read('android/app/build.gradle')

assert.match(activity, /registerPlugin\(KfeSecureStoragePlugin\.class\)/)
assert.match(activity, /registerPlugin\(KfeRideNotificationsPlugin\.class\)/)
assert.match(activity, /registerPlugin\(KfeOverlayPlugin\.class\)/)

for (const permission of [
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION'
]) assert.match(manifest, new RegExp(permission.replaceAll('.', '\\.')))

assert.match(manifest, /AndroidForegroundService/)
assert.match(manifest, /foregroundServiceType="location"/)
assert.match(manifest, /\.KfeOverlayService/)
assert.match(manifest, /foregroundServiceType="specialUse"/)
assert.match(manifest, /PROPERTY_SPECIAL_USE_FGS_SUBTYPE/)
assert.match(manifest, /\.KfeRideNotificationReceiver/)
assert.match(gradle, /capawesome-team-capacitor-android-foreground-service/)

assert.match(overlayPlugin, /Settings\.canDrawOverlays/)
assert.match(overlayPlugin, /ContextCompat/)
assert.match(overlay, /startForeground/)
assert.match(overlay, /TYPE_APPLICATION_OVERLAY/)
assert.match(overlay, /START_STICKY/)

assert.match(notifications, /AlarmManager/)
assert.match(notifications, /setAndAllowWhileIdle/)
assert.match(notifications, /RemoteInput/)
assert.match(notifications, /getPendingAction/)
assert.match(notifications, /clearPendingAction/)
assert.match(receiver, /recordPendingAction/)
assert.match(receiver, /RemoteInput\.getResultsFromIntent/)

assert.match(js, /consumePendingAction/)
assert.match(js, /getPendingAction/)
assert.match(js, /clearPendingAction/)
assert.match(js, /KfeRideNotifications\.addListener/)

console.log('KFE Phase 8 Capacitor / Android native architecture contract: PASS')
