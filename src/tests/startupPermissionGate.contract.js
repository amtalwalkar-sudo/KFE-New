import assert from 'node:assert/strict'
import fs from 'node:fs'
import { findFirstMissingNativeCheck } from '../application/startup/permissionStartupChecks.js'

const gate = fs.readFileSync('src/application/startup/permissionGate.js', 'utf8')
const checks = fs.readFileSync('src/application/startup/permissionStartupChecks.js', 'utf8')
const main = fs.readFileSync('src/main.js', 'utf8')
const app = fs.readFileSync('src/App.vue', 'utf8')
const native = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeSystemPlugin.java', 'utf8')
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')

for (const key of ['notifications', 'overlay', 'oemAutostart', 'oemBattery']) {
  assert.ok(checks.includes("key: '" + key + "'"), 'startup gate checks ' + key)
}
for (const key of ['location', 'locationServices', 'backgroundLocation']) {
  assert.doesNotMatch(checks, new RegExp("key: '" + key + "'"))
}
assert.doesNotMatch(manifest, /ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|ACCESS_BACKGROUND_LOCATION|FOREGROUND_SERVICE_LOCATION/)
assert.doesNotMatch(native, /ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|ACCESS_BACKGROUND_LOCATION|KfeNativeGpsService/)
assert.match(native, /name = "KfeNativeSystem"/)
assert.match(native, /notificationsAllowed/)
assert.match(native, /overlayAllowed/)
assert.match(gate, /registerPlugin\('KfeNativeSystem'\)/)
assert.match(gate, /await NativeGate\.getStartupPermissionStatus\(\)/)
assert.match(gate, /findFirstMissingNativeCheck/)
assert.match(main, /await runStartupPermissionGate\(\)/)
assert.ok(main.indexOf('await runStartupPermissionGate()') < main.indexOf('StartupService.startApplication()'))
assert.match(app, /permissionGateState\.status !== 'ready'/)

const ready = { notificationsAllowed: true, overlayAllowed: true, oemBackgroundSettingsRequired: true }
const oem = new Set(['oemAutostart', 'oemBattery'])
assert.equal(findFirstMissingNativeCheck(ready, oem), null)
assert.equal(findFirstMissingNativeCheck({ ...ready, notificationsAllowed: false }, oem)?.key, 'notifications')
assert.equal(findFirstMissingNativeCheck({ ...ready, overlayAllowed: false }, oem)?.key, 'overlay')
assert.equal(findFirstMissingNativeCheck(ready, new Set())?.key, 'oemAutostart')
console.log('Startup permission gate contract: non-GPS overlay and notification settings only.')
