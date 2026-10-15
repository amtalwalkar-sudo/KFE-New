# Native overlay architecture, timer and GPS root-cause audit

**Status:** audit/design record only. No runtime implementation is included in this document's change.
**Reviewed branch:** `fix/native-overlay-background-transitions` (PR #292, head `84cc80cdc7ecacf6f2ccfe971bb14b6fc4bed2a0`).
**Purpose:** record the permanent architecture decision and the source-supported causes of the Android APK/overlay timer and live-distance failures so these can be implemented together rather than patched independently.

## 1. Permanent architecture decision

The native overlay must independently execute and persist the full trip workflow for an entire shift, including fare, cancellation and fuel where supported by the frozen requirements. Opening the main PWA/WebView must not be required for any canonical business transition.

The permanent fix must start with a **canonical Android persistence/command boundary and PWA repository wiring**, then integrate native GPS lifecycle and form outcomes against that same authority. More swipe fixes, queue retries or native-only UI-stage changes are not completion.

### Current architecture and root problem

- `KfeOverlayService` advances native `actionStage` and persists selected workflow values in SharedPreferences.
- `KfeNativeEventStore` stores a durable SQLite **action queue** (event ID, stage, trip ID, payload, attempts and acknowledgement status), not canonical shift/trip/fare/cancellation records.
- `WorkModuleView.vue` consumes/replays that queue when its Work view runs.
- `WorkService` and `ShiftTripRepository` perform the authoritative business mutations in PWA IndexedDB.
- GPS start/switch and trace import are also orchestrated through PWA JavaScript, even though Android has a foreground location service.

Therefore, native stage advancement and durable event delivery can succeed while the authoritative trip mutation and its GPS side effects have not occurred. There are separate state authorities and no atomic transaction spanning the native action and canonical business record.

### Target architecture

1. Define one platform-aware canonical Work command/query contract. Browser PWA uses its IndexedDB adapter; Android PWA and overlay must read and mutate the same native-backed canonical records.
2. Make canonical mutation, operation ID, timestamp, validation outcome and idempotency durable together. Replaying a committed operation returns the original result; it does not repeat financial or audit side effects.
3. Migrate existing Android IndexedDB data safely and idempotently. Avoid a second authoritative history and verify active shifts/trips, fares, cancellations, fuel, locations, pending mutations and audit history.
4. Move lifecycle decisions required for overlay-only operation out of Work-view event handlers. Native trip transitions must own starting, switching and stopping native GPS.
5. Treat the overlay's local state as presentation and recoverable draft state. Render committed canonical state plus explicit pending/rejected operation state; do not present a UI-only transition as a committed trip.
6. On PWA resume, refresh the stores/read models from canonical native data. Event replay must not be required to create missing business records.
7. Preserve the browser-only PWA behavior and existing domain/financial semantics through adapters and regression tests.

## 2. Timer issue: source-supported diagnosis

### Observed report

The trip timer in the installed Android APK and native overlay appears stuck; opening/closing the APK causes it to update, then it becomes stuck again. The same workflow timer behaves normally in the browser PWA.

### Confirmed code findings

- `KfeOverlayService.SwipeOverlayView.formatTripTime()` calculates elapsed time from the in-memory `tripStartAt` field and `System.currentTimeMillis()`.
- The canvas schedules `postInvalidateDelayed(1000)` only while native `actionStage` is `START_RIDE` or `END_RIDE`; a timer update therefore depends on both the current native stage and redraw scheduling.
- On a native `START_RIDE` swipe, `triggerAction()` sets `tripStartAt = System.currentTimeMillis()`. However, `persistNativeWorkflow()` persists the stage and trip IDs but does not persist that timer start value as a dedicated durable native field.
- `applyState()` assigns `tripStartAt = root.optLong("tripStartAt", 0L)` from the last PWA snapshot. A PWA snapshot can therefore overwrite the native timer start with a stale or zero value when the canonical transition has not yet been processed by Work.
- The PWA timer itself is reactive to a JavaScript clock updated by `setInterval`, and refreshes on visibility/pageshow/focus. Browser background throttling and WebView suspension can delay those callbacks; a foreground refresh can make the timer jump forward, matching the reported update-on-open/close symptom.

### Most likely root cause

**Two timer authorities are competing:** native overlay timing starts from an in-memory timestamp, while PWA snapshots can overwrite it from canonical PWA state. The native start time is not independently durable, and redraw cadence is stage-dependent. This explains why opening/resuming the APK can refresh the displayed time without ensuring that it continues to advance reliably.

This is a source-supported diagnosis, not yet a physical-device-confirmed runtime trace.

### Permanent timer requirements

- One persisted authoritative event timestamp per timer purpose (trip start, shift start and any state timer), committed with the canonical transition.
- Derive elapsed duration from wall-clock timestamps; never persist an incrementing counter or depend on the WebView's interval count.
- Native overlay redraws on a native one-second cadence while the relevant timer is visible, independent of WebView lifecycle.
- PWA foreground/resume recalculates elapsed time from the same committed timestamp; PWA snapshots must not reset native timing from stale state.
- Explicitly distinguish pickup/state elapsed time from passenger trip duration; do not start a passenger-trip timer at pickup or use a native-only timestamp that is absent from the canonical trip.

## 3. GPS/live-kilometre issue: source-supported diagnosis

### Observed report

The Android APK and native overlay show zero live kilometres. Browser PWA GPS initially works while foregrounded, then stops when backgrounded or the screen turns off. The latter is consistent with browser geolocation/WebView lifecycle limitations; Android's native foreground location service should own Android background capture when permissions and OS policy allow it.

### Confirmed code findings

**A. Native overlay actions do not start/switch GPS themselves.**

- In `KfeOverlayService.triggerAction()`, `GO_TO_PICKUP` and `START_RIDE` append events and advance `actionStage`, but do not start the native GPS collector.
- `WorkService.startTrip()` starts `DEAD_MOVEMENT_TRACE`; `WorkService.startRide()` switches to `PASSENGER_RIDE_TRACE`. These are called by PWA Work event processing, so overlay-only operation cannot rely on them when the WebView is closed.
- The native overlay does stop GPS on the end-trip path, but that does not solve the missing native start/switch at pickup and ride start.

**B. The overlay displays the wrong distance field during dead movement.**

- `KfeNativeGpsService.persistLocation()` calls `KfeOverlayService.updateDeadKm()` for `DEAD_MOVEMENT_TRACE` and `updateLiveKm()` for `PASSENGER_RIDE_TRACE`.
- `KfeOverlayService` keeps both `deadKm` and `liveKm`, and labels `GO_TO_PICKUP` / `START_RIDE` as **DEAD KM**.
- Nevertheless, `SwipeOverlayView.onDraw()` always renders `liveKm` as the distance value. It does not select `deadKm` when the label says DEAD KM.

This is a direct display wiring defect: dead movement distance can be collected and updated in native state while the overlay still displays the unrelated live/business distance value, often `0.0 km`.

**C. PWA live distance depends on JavaScript polling.**

- `WorkModuleView.vue` calls `refreshLiveMovementKm()` from a JavaScript interval and passes the result through `syncOverlay()`.
- When the WebView is backgrounded or suspended, that interval is not a reliable native telemetry loop. The native collector writes trace evidence, but the PWA-derived display value is not guaranteed to refresh until JavaScript resumes.
- `androidOverlayLifecycle.js` also derives overlay state through `WorkService` reads, so its polling is not an independent source of canonical live metrics when the PWA is not executing.

**D. Collection still has environmental preconditions.**

The Android service requires location permission and a successful foreground-service start. Its resume path checks background-location permission, and the project has Xiaomi/Redmi/Poco background-setting checks. Location services, notification/foreground-service eligibility, Android version and OEM battery restrictions can still affect physical-device behavior. These are important diagnostic signals but do not explain away the confirmed orchestration and display bugs above.

### Most likely root cause

There are **two separate software causes** for the reported zero: overlay-only stage transitions do not start/switch the native collector, and the overlay renders `liveKm` even when the metric is labelled `DEAD KM`. The APK/PWA display also relies on WebView polling rather than a native live-distance projection, so it can become stale in background. Permission/OEM policy may be an additional device-specific cause and must be measured during acceptance.

### Permanent GPS requirements

- Native canonical transition starts pickup/dead-movement capture and switches to passenger capture on Start Trip, without PWA replay.
- Native service exposes a live telemetry snapshot (owner ID, event type, last fix time, accuracy, point count, cumulative distance and failure/status reason) to the overlay and PWA adapter.
- Overlay chooses the correct distance for the active event type and clearly distinguishes zero distance from waiting for first fix, permission denial, provider disabled, stale signal or collector failure.
- Accumulate distance only from valid, ordered points for the active owner/event type; restore the accumulator from durable trace evidence after service/process restart.
- Keep JSONL/raw evidence durable and import it idempotently into the canonical location repository; do not require PWA foreground replay for live capture or recovery.
- Ensure PWA resumes from the native snapshot and canonical records, not from an old JavaScript-only cached distance.
- Verify foreground-service permissions, background-location grant, location services, notifications and OEM battery/autostart requirements on the physical device.

## 4. Combined acceptance gates before calling this fixed

1. Start a shift, close the PWA, and complete multiple trips entirely from the overlay.
2. Confirm canonical trip records, start/end timestamps, fare/cancellation outcomes and GPS trace ownership exist before reopening the PWA.
3. Observe the timer advancing every second with the APK backgrounded, screen off, overlay minimized, and after overlay/service/process recreation; opening the PWA must not reset it.
4. Observe live dead kilometres during pickup and live business kilometres during the ride; both update from native fixes with the WebView closed.
5. Disable network connectivity and repeat; GPS capture and local persistence must not depend on internet.
6. Interrupt a transition and retry the same operation ID; no missing/duplicate trips, fare side effects, cancellations, audit writes or GPS points.
7. Reopen the PWA on a non-Work route and verify the same canonical state; no Work-screen replay is needed to make records exist.
8. Run automated contracts and Android build/CI, then perform physical-device tests for screen-off, background, restart, permissions and OEM battery behavior.

## 5. Scope and status

This document records architecture decisions, source inspection and acceptance criteria only. It does not implement the canonical store, change timer behavior, modify GPS lifecycle, or claim that CI/APK/device tests passed. The combined implementation should address the canonical persistence boundary, timer timestamp ownership/redraw, native GPS lifecycle, correct live-distance projection and idempotent form outcomes in one coordinated change.
