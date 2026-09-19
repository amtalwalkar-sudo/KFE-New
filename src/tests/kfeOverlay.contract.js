import fs from 'node:fs'
import assert from 'node:assert/strict'

const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
const activity = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/MainActivity.java', 'utf8')
const plugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayPlugin.java', 'utf8')
const service = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8')
const work = fs.readFileSync('src/views/WorkModuleView.vue', 'utf8')
const bridge = fs.readFileSync('src/services/kfeOverlayService.js', 'utf8')

assert.match(manifest, /SYSTEM_ALERT_WINDOW/)
assert.match(manifest, /FOREGROUND_SERVICE_SPECIAL_USE/)
assert.match(manifest, /KfeOverlayService/)
assert.match(manifest, /android:foregroundServiceType="specialUse"/)
assert.match(activity, /registerPlugin\(KfeOverlayPlugin\.class\)/)
assert.match(plugin, /ACTION_MANAGE_OVERLAY_PERMISSION/)
assert.match(plugin, /Settings\.canDrawOverlays/)
assert.match(service, /TYPE_APPLICATION_OVERLAY/)
assert.match(service, /FOREGROUND_SERVICE_TYPE_SPECIAL_USE/)
assert.match(service, /SWIPE TO OPEN KFE/)
assert.match(bridge, /registerPlugin\('KfeOverlay'\)/)
assert.doesNotMatch(work, /class="target-hud"/)
assert.doesNotMatch(work, /targetOverlay/)
assert.match(work, /KfeOverlayService/)
assert.match(work, /syncAndroidOverlay/)

console.log('Native KFE floating overlay contract passed.')
