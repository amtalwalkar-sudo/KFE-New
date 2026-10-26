import assert from 'node:assert/strict'
import fs from 'node:fs'

const indicator = fs.readFileSync('src/components/shell/GpsStatusIndicator.vue', 'utf8')
const shell = fs.readFileSync('src/components/shell/KfeShell.vue', 'utf8')
const plugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeTripBoundaryLocationPlugin.java', 'utf8')
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
const overlayService = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8')
const workService = fs.readFileSync('src/application/work/workService.js', 'utf8')
const eventLocationService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')

assert.match(shell, /import GpsStatusIndicator from '\.\/GpsStatusIndicator\.vue'/,
  'the GPS status indicator must be mounted in the shared application header')
assert.match(shell, /<GpsStatusIndicator \/>/,
  'the GPS status indicator must be visible from the shared shell')
assert.match(indicator, /window\.setInterval/, 'pending GPS status must refresh while the panel is open')
assert.match(indicator, /getLocationStatus/,
  'the status display must read the Android permission/provider state')
assert.match(indicator, /requestBackgroundLocationPermission/,
  'background location permission must only be requested from the explicit user action')
assert.match(indicator, /Enable background GPS/,
  'the permission action must be user-facing')
assert.match(plugin, /ACCESS_BACKGROUND_LOCATION/,
  'native permission checks must include Android background location')
assert.match(plugin, /openBackgroundLocationSettings/, 'Android versions requiring Settings must have a user-triggered permission fallback')
assert.match(plugin, /backgroundCaptureAllowed/,
  'the native status response must expose whether background capture is allowed')
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
assert.match(eventLocationService, /id: entityType === 'TRIP'/, 'PWA fallback and native retry must use one stable event snapshot identity')
assert.match(eventLocationService, /queueTripBoundaryEventLocation/,
  'the PWA event pathway must use native durable background queueing')
assert.match(workService, /captureAndPersistEventLocation\('TRIP', data\?\.id, 'TRIP_CANCELLED'/,
  'cancellation must be recorded as its own location event')
console.log('PASS: GPS header status and explicit background-location permission gate are wired')
