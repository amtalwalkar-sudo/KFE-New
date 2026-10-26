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
for (const key of ['location', 'locationServices']) assert.doesNotMatch(checks, new RegExp("key: '\\s*" + key + "'"), key + ' must not block startup; trip workflow must work when a GPS fix is unavailable')
assert.doesNotMatch(checks, /key: 'backgroundLocation'/)
assert.match(manifest, /ACCESS_FINE_LOCATION/)
assert.match(manifest, /ACCESS_COARSE_LOCATION/)
assert.match(manifest, /FOREGROUND_SERVICE_LOCATION/)
assert.match(manifest, /foregroundServiceType="specialUse\|location"/)
assert.match(manifest, /ACCESS_BACKGROUND_LOCATION/)
assert.doesNotMatch(manifest, /KfeNativeGpsService/)
assert.match(native, /ACCESS_FINE_LOCATION/)
assert.match(native, /ACCESS_COARSE_LOCATION/)
assert.doesNotMatch(native, /KfeNativeGpsService/)
assert.match(native, /name = "KfeNativeSystem"/)
assert.match(native, /notificationsAllowed/)
assert.match(native, /overlayAllowed/)
assert.match(native, /locationAllowed/)
assert.match(native, /locationServicesEnabled/)
assert.match(gate, /registerPlugin\('KfeNativeSystem'\)/)
assert.match(gate, /await NativeGate\.getStartupPermissionStatus\(\)/)
assert.match(gate, /findFirstMissingNativeCheck/)
assert.match(main, /await runStartupPermissionGate\(\)/)
assert.ok(main.indexOf('await runStartupPermissionGate()') < main.indexOf('StartupService.startApplication()'))
assert.match(app, /permissionGateState\.status !== 'ready'/)

const ready = { notificationsAllowed: true, overlayAllowed: true, locationAllowed: true, locationServicesEnabled: true, oemBackgroundSettingsRequired: true }
const oem = new Set(['oemAutostart', 'oemBattery'])
assert.equal(findFirstMissingNativeCheck(ready, oem), null)
assert.equal(findFirstMissingNativeCheck({ ...ready, locationAllowed: false, locationServicesEnabled: false }, oem), null, 'Missing location permission or disabled GPS must not block the work app; boundary snapshots are best-effort.')
assert.equal(findFirstMissingNativeCheck({ ...ready, notificationsAllowed: false }, oem)?.key, 'notifications')
assert.equal(findFirstMissingNativeCheck({ ...ready, overlayAllowed: false }, oem)?.key, 'overlay')
assert.equal(findFirstMissingNativeCheck(ready, new Set())?.key, 'oemAutostart')
console.log('Startup permission gate contract: foreground one-shot trip GPS plus overlay/notification settings; no background tracking.')
