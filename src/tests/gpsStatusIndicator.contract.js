import assert from 'node:assert/strict'
import fs from 'node:fs'

const indicator = fs.readFileSync('src/components/shell/GpsStatusIndicator.vue', 'utf8')
const shell = fs.readFileSync('src/components/shell/KfeShell.vue', 'utf8')
const plugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeTripBoundaryLocationPlugin.java', 'utf8')
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
const overlayService = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8')
const workService = fs.readFileSync('src/application/work/workService.js', 'utf8')
const eventLocationService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const gpsService = fs.readFileSync('src/application/location/gpsPermissionService.js', 'utf8')
const gpsAdapter = fs.readFileSync('src/infrastructure/android/gpsStatusAdapter.js', 'utf8')
const nativePluginRegistry = fs.readFileSync('src/infrastructure/capacitor/nativePluginRegistry.js', 'utf8')

assert.match(shell, /import GpsStatusIndicator from '\.\/GpsStatusIndicator\.vue'/,
  'the GPS status indicator must be mounted in the shared application header')
assert.match(shell, /<GpsStatusIndicator \/>/,
  'the GPS status indicator must be visible from the shared shell')
assert.doesNotMatch(indicator, /setInterval|setTimeout/, 'GPS status must not run a periodic polling loop')
assert.match(indicator, /GpsPermissionService/, 'GPS status UI must use the application permission service')
assert.doesNotMatch(indicator, /@capacitor|registerPlugin|NativeGps/, 'GPS status UI must not own native plugin access')
assert.match(gpsService, /WorkRuntimePorts\.gpsPermissions/, 'application permission service must delegate to the native adapter')
assert.match(gpsAdapter, /NativePlugins\.tripBoundaryLocation/)
assert.match(nativePluginRegistry, /registerPlugin\('KfeTripBoundaryLocation'\)/, 'native GPS plugin registration belongs to the shared infrastructure registry')
assert.match(indicator, /getStatus/,

  'the status display must read the Android permission/provider state')
assert.match(indicator, /requestBackgroundPermission/,
  'background location permission must only be requested from the explicit user action')
assert.match(indicator, /Enable background GPS/,
  'the permission action must be user-facing')
assert.match(plugin, /ACCESS_BACKGROUND_LOCATION/,
  'native permission checks must include Android background location')
assert.match(plugin, /openBackgroundLocationSettings/, 'Android versions requiring Settings must have a user-triggered permission fallback')
assert.match(plugin, /backgroundCaptureAllowed/,
  'the native status response must expose whether background capture is allowed')
assert.match(plugin, /pendingCount > 0 && fine && background\) KfeOverlayService\.retryPendingLocations\(context\)/,
  'saved GPS events resume on explicit app status refresh without permission prompts or periodic polling')
assert.match(plugin, /Background location permission was not granted\. Background GPS capture remains disabled\./,
  'denied background permission must be treated as disabled, not bypassed')
assert.match(manifest, /uses-permission android:name="android\.permission\.ACCESS_BACKGROUND_LOCATION"/,
  'the Android manifest must declare the permission required for background location')
assert.match(overlayService, /pendingEventGpsCaptures\.v1/,
  'pending event locations must survive WebView reloads and process death')
assert.match(overlayService, /Discarded pending GPS request for missing trip/, 'a reset/deleted trip must not receive a later orphan GPS snapshot')
assert.match(overlayService, /schedulePendingGpsRetry/,
  'failed fixes must be retried while required permissions remain granted')
assert.match(overlayService, /PICKUP_START/,
  'native overlay must queue pickup-origin location')
assert.match(overlayService, /TRIP_CANCELLED/,
  'native overlay must queue cancellation location separately from drop-off')
assert.match(eventLocationService, /stableId = \(entityType, entityId, eventType\)/, 'browser snapshots must use a stable event identity')
assert.doesNotMatch(plugin, /captureCurrentLocation/, 'Android must use only the durable native event queue')
assert.match(eventLocationService, /WorkRuntimePorts\.tripBoundaryLocation\.queueEventLocationCapture/,
  'the PWA event pathway must use native durable background queueing')
assert.match(workService, /captureAndPersistEventLocation\('TRIP', data\?\.id, 'TRIP_CANCELLED'/,
  'cancellation must be recorded as its own location event')
assert.match(indicator, /position:fixed/, 'GPS status panel must escape narrow header containing blocks on Android')
assert.match(indicator, /width:min.*360px,calc.*100vw - 24px/, 'GPS panel must use a readable width constrained to the viewport')
assert.match(indicator, /max-height:calc.*100dvh/, 'GPS panel height must fit within the visible viewport')
assert.match(indicator, /overflow-y:auto/, 'GPS panel content must scroll vertically when it exceeds available height')
assert.match(indicator, /overflow-wrap:normal/, 'GPS panel must preserve normal word wrapping')
assert.match(indicator, /word-break:normal/, 'GPS panel must not break every word into narrow columns')
assert.match(indicator, /gps-status__close/, 'GPS panel must retain a visible close action')
console.log('PASS: GPS header status and explicit background-location permission gate are wired')
