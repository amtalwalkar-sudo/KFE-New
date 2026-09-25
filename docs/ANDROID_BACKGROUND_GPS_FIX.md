# Future Android Background GPS / Ride Line-KM Fix

## Problem observed on real phone

When a ride is running and the Android phone screen is turned off, KFE stops receiving enough GPS trace points for line-KM calculation. The ride continues, but GPS line-KM does not continue reliably in the background.

## Root cause identified

The current web/PWA location path uses `navigator.geolocation.watchPosition()` from the WebView. KFE also starts an Android foreground service, but the foreground service is not currently the authoritative GPS trace collector. Android may suspend WebView JavaScript/geolocation callbacks when the screen is off.

Therefore, a running foreground-service notification alone does not guarantee that the WebView GPS watch continues producing ride trace points.

## Required future Android implementation

1. Start a dedicated Android location foreground service when a passenger ride starts.
2. Use native Android location APIs from that service for continuous ride tracking.
3. Declare/use the Android `location` foreground-service type and required permissions for the supported target SDK.
4. Continue collecting locations with the screen off and KFE WebView backgrounded.
5. Persist native GPS trace points durably while the WebView may be suspended.
6. Bridge/synchronize the native trace into KFE's canonical `LocationRepository` when available.
7. Keep GPS coordinates/timestamps authoritative; place-name reverse geocoding remains enrichment only.
8. Calculate ride line-KM from the complete persisted trace, not only WebView callbacks.
9. Stop the native location service on ride completion or cancellation.
10. Keep the browser/PWA geolocation path as the non-native fallback.

## Physical Android acceptance test

F1 must remain DEFERRED until proven on a real Android phone:

- Start shift and passenger ride.
- Confirm GPS trace points are being collected.
- Turn the screen OFF / lock the phone.
- Move the vehicle a meaningful distance with the screen off.
- Resume KFE.
- Verify additional GPS trace points exist for the screen-off interval.
- Verify line-KM increased using those points.
- Complete the ride and verify persisted trip, GPS trace and final line-KM reconcile.
- Repeat with the app backgrounded.
- Verify resume does not create duplicate trace points or duplicate distance.

## Phase boundary

This is an Android/native implementation and physical-device validation item. It belongs to Phase 5 / Android audit and must not be marked PASS during the browser-only Phase 4 matrix.

The current browser implementation must not be represented as proof of screen-off Android background GPS continuity.
