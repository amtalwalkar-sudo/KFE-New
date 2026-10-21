import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = file => fs.readFileSync(file, 'utf8')
const manifest = read('android/app/src/main/AndroidManifest.xml')
const overlayPlugin = read('android/app/src/main/java/com/kanishka/pwa/KfeOverlayPlugin.java')
const nativeActions = read('android/app/src/main/java/com/kanishka/pwa/KfeNativeWorkActionsPlugin.java')
const nativeGpsPlugin = read('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsPlugin.java')
const nativeGpsService = read('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsService.java')
const secureStorage = read('android/app/src/main/java/com/kanishka/pwa/KfeSecureStoragePlugin.java')
const overlay = read('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java')
const activity = read('android/app/src/main/java/com/kanishka/pwa/MainActivity.java')
const androidOverlayLifecycle = read('src/infrastructure/android/androidOverlayLifecycle.js')

for (const permission of [
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.SYSTEM_ALERT_WINDOW'
]) assert.match(manifest, new RegExp(permission.replaceAll('.', '\\.')))

assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION|FOREGROUND_SERVICE_LOCATION|\.KfeNativeGpsService/)
assert.doesNotMatch(manifest, /SCHEDULE_EXACT_ALARM/)
assert.match(manifest, /android:allowBackup="false"/)
assert.match(manifest, /android:fullBackupOnly="false"/)
const receiverDeclarations = [...manifest.matchAll(/<receiver\b[^>]*>/g)].map(match => match[0])
const recoveryReceiver = receiverDeclarations.find(declaration => declaration.includes('KfeLifecycleRecoveryReceiver')) || ''
assert.match(recoveryReceiver, /android:exported="true"/)
const recoveryReceiverBlock = manifest.match(/<receiver\b(?=[^>]*KfeLifecycleRecoveryReceiver)[^>]*>[\s\S]*?<\/receiver>/)?.[0] || ''
assert.match(recoveryReceiverBlock, /android.intent.action.BOOT_COMPLETED/)
assert.match(recoveryReceiverBlock, /android.intent.action.MY_PACKAGE_REPLACED/)
assert.equal((recoveryReceiverBlock.match(/<action\b/g) || []).length, 2,
  'The exported lifecycle receiver must subscribe only to the two protected system lifecycle actions.')
assert.equal(receiverDeclarations.filter(declaration => /android:exported="true"/.test(declaration) && !declaration.includes('KfeLifecycleRecoveryReceiver')).length, 0,
  'Only the lifecycle receiver for protected system boot/package-replaced broadcasts may be exported.')
assert.match(manifest, /<provider[^>]+android:exported="false"/)
assert.match(manifest, /<service[^>]+android:exported="false"/)

assert.match(activity, /registerPlugin\(KfeSecureStoragePlugin\.class\)/)
assert.match(activity, /registerPlugin\(KfeNativeWorkActionsPlugin\.class\)/)
assert.match(activity, /registerPlugin\(KfeOverlayPlugin\.class\)/)

assert.match(overlayPlugin, /Settings\.canDrawOverlays/)
assert.match(overlayPlugin, /ACTION_MANAGE_OVERLAY_PERMISSION/)
assert.match(overlayPlugin, /call\.reject\("Overlay permission is not granted\."/)
assert.match(overlay, /TYPE_APPLICATION_OVERLAY/)
assert.match(overlay, /START_NOT_STICKY/)
assert.match(androidOverlayLifecycle, /if \(!permission\.granted\)/)
assert.match(androidOverlayLifecycle, /AndroidOverlay\.hide\(\)/)

assert.match(nativeGpsPlugin, /POST_NOTIFICATIONS/)
assert.match(nativeGpsPlugin, /requestPermissionForAlias\("notifications", call, "startupNotificationsPermissionCallback"\)/)
assert.match(nativeGpsPlugin, /@PermissionCallback/)
assert.match(nativeGpsPlugin, /areNotificationsEnabled\(\)/)
assert.match(nativeGpsService, /startForeground\(/)
assert.match(overlay, /startForeground\(NOTIFICATION_ID,buildNotification\(\)\)/)
assert.doesNotMatch(nativeActions, /RemoteInput|AlarmManager|NotificationCompat\.Action/)
assert.equal(fs.existsSync('android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationsPlugin.java'), false)
assert.equal(fs.existsSync('android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationReceiver.java'), false)
assert.equal(fs.existsSync('src/infrastructure/android/kfeRideNotificationService.js'), false)

assert.match(secureStorage, /AndroidKeyStore/)
assert.match(secureStorage, /AES\/GCM\/NoPadding/)
assert.match(secureStorage, /PURPOSE_ENCRYPT/)
assert.match(secureStorage, /PURPOSE_DECRYPT/)
assert.doesNotMatch(secureStorage, /SharedPreferences\([^)]*MODE_WORLD_(READABLE|WRITEABLE)/)


const scanRoots = ['src', 'android/app/src/main']
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp|github_pat|sk_live|sk_test|AIza)[A-Za-z0-9_-]{16,}\b/,
  /(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_+\/-]{20,}['"]/i
]
const ignored = /(?:node_modules|dist|build|\.gradle)/
const files = []
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (ignored.test(full)) continue
    if (entry.isDirectory()) walk(full)
    else if (/\.(?:js|vue|java|kt|gradle|xml|json|properties|ts)$/.test(entry.name)) files.push(full)
  }
}
scanRoots.forEach(walk)
for (const file of files) {
  const text = read(file)
  for (const pattern of secretPatterns) assert.doesNotMatch(text, pattern, `possible accidental secret in ${file}`)
}

console.log('KFE Phase 8 security / permissions gate contract: PASS')
