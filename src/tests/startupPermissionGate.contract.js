import assert from 'node:assert/strict'
import fs from 'node:fs'
import { findFirstMissingNativeCheck } from '../application/startup/permissionStartupChecks.js'

const gate = fs.readFileSync('src/application/startup/permissionGate.js', 'utf8')
const main = fs.readFileSync('src/main.js', 'utf8')
const app = fs.readFileSync('src/App.vue', 'utf8')
const native = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsPlugin.java', 'utf8')
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')

for (const key of ['location', 'backgroundLocation', 'locationServices', 'notifications', 'overlay', 'oemAutostart', 'oemBattery']) {
  assert.ok(gate.includes("key: '" + key + "'") || fs.readFileSync('src/application/startup/permissionStartupChecks.js', 'utf8').includes("key: '" + key + "'"), 'startup gate must check ' + key)
}
assert.match(gate, /attempted\.has\(missing\.key\)/)
assert.match(gate, /await NativeGate\.requestStartupPermission/)
assert.match(gate, /await NativeGate\.openStartupSetting/)
assert.match(gate, /waitForForegroundReturn\(\)/)
assert.match(gate, /permissionGateState\.status = 'ready'/)
assert.match(gate, /findFirstMissingNativeCheck/)

assert.match(gate, /const status = await NativeGate\.getStartupPermissionStatus\(\)/,
  'each gate pass must query current Android state instead of relying on a cached startup snapshot')
assert.match(gate, /await returned;\s*continue/,
  'returning from Android Settings must restart the gate and re-read current state')
assert.match(native, /checkSelfPermission\(getContext\(\), Manifest\.permission\.ACCESS_FINE_LOCATION\)/)
assert.match(native, /checkSelfPermission\(getContext\(\), Manifest\.permission\.ACCESS_BACKGROUND_LOCATION\)/)
assert.match(native, /locationManager\.isLocationEnabled\(\)/,
  'Location Services must be checked from Android rather than inferred from permission grants')
assert.match(gate, /persistConfirmedOemSettings/)
assert.match(main, /await runStartupPermissionGate\(\)/)
assert.ok(main.indexOf('await runStartupPermissionGate()') < main.indexOf('StartupService.startApplication()'), 'gate must finish before application startup')
assert.match(app, /permissionGateState\.status !== 'ready'/)
assert.match(app, /retryStartupPermissionGate/)
assert.match(native, /getStartupPermissionStatus/)
assert.match(native, /requestStartupPermission/)
assert.match(native, /openStartupSetting/)
assert.match(native, /Settings\.ACTION_LOCATION_SOURCE_SETTINGS/)
assert.match(native, /Settings\.ACTION_MANAGE_OVERLAY_PERMISSION/)
assert.match(native, /ACCESS_BACKGROUND_LOCATION/)
assert.match(native, /POST_NOTIFICATIONS/)
assert.match(native, /isIgnoringBatteryOptimizations/)
assert.match(native, /oemBackgroundSettingsRequired/)
assert.match(native, /AutoStartManagementActivity/)
assert.match(native, /PowerSettings/)
assert.match(manifest, /com\.miui\.securitycenter/)
assert.match(manifest, /com\.miui\.powerkeeper/)
assert.match(manifest, /com\.miui\.powercenter/)

// Regression matrix: a fully configured phone must not trigger any prompt;
// if exactly one real requirement is missing, that requirement is the only
// one surfaced first. OEM confirmations are retained between app launches.
const ready = {
  fineLocationAllowed: true,
  backgroundLocationAllowed: true,
  locationServicesEnabled: true,
  notificationsAllowed: true,
  overlayAllowed: true,
  oemBackgroundSettingsRequired: true
}
const bothOemConfirmed = new Set(['oemAutostart', 'oemBattery'])
assert.equal(findFirstMissingNativeCheck(ready, bothOemConfirmed), null,
  'granted permissions and enabled settings must not trigger startup prompts')
for (const [field, key] of [
  ['fineLocationAllowed', 'location'],
  ['backgroundLocationAllowed', 'backgroundLocation'],
  ['locationServicesEnabled', 'locationServices'],
  ['notificationsAllowed', 'notifications'],
  ['overlayAllowed', 'overlay']
]) {
  assert.equal(findFirstMissingNativeCheck({ ...ready, [field]: false }, bothOemConfirmed)?.key, key,
    'only the genuinely missing requirement should be surfaced: ' + key)
}
assert.equal(findFirstMissingNativeCheck(ready, new Set())?.key, 'oemAutostart',
  'unconfirmed OEM settings should be surfaced in sequence')
assert.equal(findFirstMissingNativeCheck(ready, new Set(['oemAutostart']))?.key, 'oemBattery',
  'confirming autostart should not repeat that prompt when checking the next requirement')

console.log('Startup permission gate contract and regression matrix: PASS')
