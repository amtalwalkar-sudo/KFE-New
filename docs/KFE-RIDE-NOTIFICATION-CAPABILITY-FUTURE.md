# KFE Ride Notification Capability — Future Continuation Note

**Status:** Preserved / parked for future continuation  
**Date:** 2026-09-19  
**Purpose:** Give a future AI/ML coding agent enough context to resume the native ride-notification work without rediscovering the architecture, workflow, decisions, or current limitations.

---

## 1. Decision / Freeze

The existing Android ride-notification implementation is **not being removed**.

For the current driver UX, an in-app/screen-overlay workflow may be used instead because it is more deterministic for the foreground PWA/app experience.

The native notification capability should remain intact as a future capability and fallback.

**Do not delete or rewrite the native notification bridge merely because notifications are currently unreliable.**

---

## 2. What Exists Today

### JavaScript service

Primary file:

- `src/services/kfeRideNotificationService.js`

The service registers:

`registerPlugin('KfeRideNotifications')`

It exposes the ride-notification workflow:

- `goOnline()`
- `beginPickup(tripId)`
- `setPickupDuration(minutes)`
- `startRide(tripId)`
- `setRideDuration(minutes)`
- `retryEndRide()`
- `completeRide()`
- `clear()`
- `addListener(event, handler)`

The workflow state is persisted in localStorage under:

`kfe.ride.notification.workflow.v1`

The service deliberately checks:

`Capacitor.isNativePlatform()`

before making native calls.

### Android plugin

Primary file:

- `android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationsPlugin.java`

Capacitor plugin name:

`KfeRideNotifications`

Notification channel:

`kfe_ride_actions`

Notification ID:

`4101`

The plugin currently supports:

- notification permission request
- immediate notification display
- scheduled notification display
- scheduled-notification cancellation
- persistent/ongoing notification
- Android `RemoteInput`
- ride-action event emission back to JavaScript

### Android receiver

Primary file:

- `android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationReceiver.java`

It handles two broadcast actions:

- `ACTION_ALARM`
- `ACTION_ACTION`

For alarm events it posts the relevant notification.

For action events it:

1. Reads `RemoteInput`.
2. Cancels the notification.
3. Stores a pending event in SharedPreferences.
4. Emits `rideNotificationAction` through the native plugin when the plugin instance exists.

### Android registration

Primary files:

- `android/app/src/main/java/com/kanishka/pwa/MainActivity.java`
- `android/app/src/main/AndroidManifest.xml`

`MainActivity` registers:

`KfeRideNotificationsPlugin`

The manifest declares:

- `POST_NOTIFICATIONS`
- `SCHEDULE_EXACT_ALARM`
- the ride notification receiver

The receiver is declared as:

`exported="false"`

---

## 3. Ride Notification State Machine

The intended stages are:

`GO_TO_PICKUP`

↓

`ENTER_PICKUP_DURATION`

↓

`START_RIDE`

↓

`ENTER_RIDE_DURATION`

↓

`END_RIDE`

↓

`GO_TO_PICKUP`

### Current timing behaviour

The JavaScript service defines:

`TWO_MINUTES = 2 * 60 * 1000`

The current intended behaviour is:

- after going to pickup, pickup-duration notification is scheduled after 2 minutes
- after starting the ride, ride-duration notification is scheduled after 2 minutes
- after entering ride duration, END_RIDE is scheduled for the entered duration
- completing the ride clears relevant scheduled notifications and returns to GO_TO_PICKUP

---

## 4. Driver-Screen Integration

Primary file:

- `src/views/WorkModuleView.vue`

The Work cockpit currently calls the notification service at these points:

### Going online

After a successful shift start:

`KfeRideNotificationService.goOnline()`

### Going to pickup

`KfeRideNotificationService.beginPickup(tripId)`

### Starting the passenger ride

`KfeRideNotificationService.startRide(tripId)`

### Completing the ride

`KfeRideNotificationService.completeRide()`

The Work view also listens for:

`rideNotificationAction`

and maps notification stages back into driver actions:

- `GO_TO_PICKUP` → start going to pickup
- `ENTER_PICKUP_DURATION` → save pickup duration
- `START_RIDE` → start trip
- `ENTER_RIDE_DURATION` → save ride duration
- `END_RIDE` → end trip with fare

---

## 5. Important Web/PWA Guard

A runtime error was observed in the deployed web/PWA build:

> `KfeRideNotifications plugin is not implemented on web`

The service was subsequently changed so `addListener()` does not call the native plugin on web.

Current intended rule:

**Never invoke native-only notification listener functionality on the web build.**

The web/PWA build must remain functional without the Android native plugin.

---

## 6. Known Current Problem

Android notification permission is **not the assumed root cause**.

The driver device was checked and permissions were confirmed as granted.

The observed state was:

- KFE WORK visible
- ONLINE
- READY FOR NEXT TRIP
- notification capability expected
- no visible Android ride notification

Investigation identified a likely reliability problem in the native initialization/posting sequence.

### Current implementation detail

Android `requestPermission()` may initiate a runtime permission request and immediately resolve the Capacitor call.

The JavaScript service then proceeds to `show()`.

That means notification posting can race permission completion on installations/states where permission has just been requested.

Additionally:

- native notification exceptions are currently swallowed by the JS `call()` helper
- the native `show()` method does not expose detailed notification-posting failure information
- Android notification-channel settings are persistent; changing channel importance in code does not necessarily change an already-created user's channel configuration

These are **investigation findings**, not a reason to delete the capability.

---

## 7. What Was Already Fixed

A web runtime safety fix was committed:

**Commit:** `fa215b7`  
**Message:** `fix: guard ride notification listener on web`

This changed the listener path so web/PWA does not attempt to use the unimplemented native plugin.

Keep this fix.

---

## 8. Previous CI/Test Work

Contract test:

- `src/tests/kfeRideNotifications.contract.js`

It statically verifies that the JavaScript service and Android native implementation contain the expected notification workflow pieces.

It checks for:

- `ENTER_PICKUP_DURATION`
- `ENTER_RIDE_DURATION`
- `END_RIDE`
- `TWO_MINUTES`
- ongoing Android notification
- `RemoteInput`
- GO_TO_PICKUP
- START_RIDE
- END_RIDE
- Android `RemoteInput.getResultsFromIntent`

Do not weaken this contract merely to make CI green.

---

## 9. Future Preferred Direction

If native notification reliability is revisited, investigate the native implementation **end-to-end** before changing the driver workflow.

Recommended investigation order:

1. Confirm Capacitor plugin registration at runtime.
2. Confirm `KfeRideNotificationsPlugin.load()` is executed.
3. Confirm notification channel creation and actual channel importance.
4. Confirm Android notification permission state at the moment `show()` is called.
5. Make permission handling awaitable/deterministic.
6. Make `show()` return/report actual Android failure conditions.
7. Confirm `NotificationManager.notify()` is reached.
8. Confirm scheduled alarms actually fire.
9. Confirm receiver invocation after process/background transitions.
10. Confirm `RemoteInput` action delivery.
11. Confirm action delivery back into JavaScript after the app has returned to the foreground.
12. Test on the actual Android target device and current Android version.

Do not assume that a green static contract test proves Android runtime notification delivery.

---

## 10. Possible Foreground Overlay Strategy

For the driver's foreground experience, an in-app overlay is an acceptable and potentially preferred UX.

The overlay should use the same logical state machine rather than creating a second business workflow.

The notification capability should remain the **background/external delivery channel**.

The overlay should be the **foreground driver interaction channel**.

This means both should ultimately represent the same stages:

`GO_TO_PICKUP`

→ `ENTER_PICKUP_DURATION`

→ `START_RIDE`

→ `ENTER_RIDE_DURATION`

→ `END_RIDE`

→ `GO_TO_PICKUP`

### Critical interaction rule

For the overlay:

**Swipe is navigation only.**

Swipe must never implicitly save data.

The driver must explicitly tap:

- Save
- Next
- Confirm
- End Ride
- or the applicable existing action

depending on the stage.

The driver can swipe back to correct previously entered information.

Traditional buttons remain available.

Do not turn the overlay into a gesture-only workflow.

---

## 11. Future AI/ML Continuation Instructions

When a future AI/ML agent is asked to continue this work:

### First read

1. This file.
2. `src/services/kfeRideNotificationService.js`
3. `src/views/WorkModuleView.vue`
4. `android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationsPlugin.java`
5. `android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationReceiver.java`
6. `android/app/src/main/java/com/kanishka/pwa/MainActivity.java`
7. `android/app/src/main/AndroidManifest.xml`
8. `src/tests/kfeRideNotifications.contract.js`

### Then inspect runtime before changing architecture

Do not restart the investigation from scratch.

Do not remove the existing native capability.

Do not assume notification permission is the problem without checking the actual runtime state.

Do not replace the native capability with an overlay unless explicitly requested.

If an overlay already exists, treat it as a foreground presentation of the same notification state machine, not as a replacement business workflow.

---

## 12. Desired Long-Term Architecture

The eventual clean architecture is:

**One ride workflow state machine**

with multiple presentation/delivery surfaces:

- **KFE foreground overlay** — primary driver interaction
- **Android notification** — background/reminder capability
- **future platform channels** — optional

All surfaces must converge on the same ride state and business actions.

The notification layer must never become a second source of truth for trips.

The canonical ride/shift data remains in the existing KFE domain/store/repository architecture.

---

## 13. Do Not Lose These Decisions

- Keep the native notification work.
- Keep the Android bridge.
- Keep the static contract test.
- Keep the web safety guard.
- Do not make permissions the default explanation for missing notifications.
- Do not let notification UI become a second trip state machine.
- If an overlay is implemented, it is a foreground interaction surface over the same workflow.
- Swipe navigates only.
- Explicit Save/Confirm commits entered values.
- Previous/Back remains available for correction.
- Existing buttons remain available.
- Future work should continue from this document and the listed source files rather than rediscovering the implementation.

---

## 14. Current Status Summary

**Native notification capability:** Implemented, preserved, not deleted.

**Web/PWA native-plugin crash:** Guarded.

**Android notification delivery:** Requires future runtime-level investigation.

**Driver foreground alternative:** Screen overlay is a viable next UX direction.

**Business workflow:** Must remain single-source-of-truth.

**Future continuation:** Start from this document and the exact files listed above.
