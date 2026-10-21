> **Superseded 2026-10-22:** GPS capture/tracking and Valhalla routing have been removed from the active KFE runtime. This document is retained as historical audit context only; do not use it as an implementation or release contract.

> **Active runtime clarification (2026-10-21):** this historical audit describes an earlier live-kilometre/Valhalla design. The active requirement is one-shot trip-boundary GPS snapshots only. Continuous tracking, routing, dead/business-kilometre calculations, GPS-gap UI, and the Offline Maps screen are dormant; use the active contract in `docs/ANDROID-NATIVE-GPS-CONTRACT.md` for acceptance.

# Work Live KM, GPS and Routing — Layer 1 Audit

**Status:** Offline-first/incremental-routing implementation added on `fix/offline-incremental-gps-routing`; CI and physical-device acceptance pending  
**Scope:** Work screen live movement display, GPS trace capture, road routing, and distance classification  
**Authority:** `KFE_WORK_COCKPIT_BASELINE.md`, `docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md`, `docs/ANDROID-NATIVE-GPS-CONTRACT.md`, and `KFE_BUSINESS_RULES_REGISTER.md`

## Required driver behavior

- While going to pickup, display live **DEAD KM**.
- From Start Trip until End Trip, display live **BUSINESS KM**.
- Personal KM is only the pre-shift odometer-gap allocation and does not need a live active-shift display.
- The timer and existing swipe workflow remain independent of the distance readout.
- Live GPS distance is an estimate; it must not be described as final road-matched distance.

## Findings from source

1. **Live Work display — confirmed gap on the audited base:** `src/views/WorkModuleView.vue` supplied the cockpit a hard-coded `0.0 km` and rendered no live kilometre readout for pickup or active ride. The Android overlay had a generic Live KM field, but it was not a substitute for a labelled readout on the main Work screen.
2. **GPS capture — implementation exists, real-world operation not yet proven:** browser movement traces use a nominal 20-second interval. The Android native foreground GPS service requests high-accuracy updates at 5 seconds, with a 3-second minimum update interval and 8-metre minimum displacement. The native service persists trace points to a local JSONL file and the PWA imports them at trip completion. These code settings do not prove permission grants, background reliability, or device-level point continuity.
3. **Trace quality — distinction matters:** movement accounting filters GPS points above 80-metre accuracy and suppresses small stationary jitter; raw line-distance summation alone does not. The new live display therefore uses the existing trace filter before calculating its estimate.
4. **Routing — implementation exists, external service is not verified:** `ValhallaRoutingAdapter` calls the configured `/trace_route` endpoint with map matching and kilometre units. Existing adapter tests use mocked responses. They verify request/response handling, not network reachability or real-road accuracy.
5. **Routing evidence defect corrected on this branch:** previously, a Valhalla response with a distance but no geometry was converted into an empty LineString, which could be treated as road-matched geometry. The adapter now preserves missing geometry as `null`, and movement accounting accepts a routed distance as road-matched only when a valid LineString with at least two coordinates is present. Otherwise it falls back to filtered GPS trace distance and preserves fallback provenance.
6. **Distance categories:** pickup/dead movement and passenger/business movement use separate event types. The Work screen now selects the trace for the current lifecycle state, shows **DEAD KM** during pickup and **BUSINESS KM** during the passenger ride, and refreshes the display every three seconds. Android reads the native trace; browser/PWA uses the active movement trace. Personal KM remains in shift-start gap allocation and is not shown as live active-shift distance.

## Verification status

| Gate | Result |
|---|---|
| Source trace for GPS collection and persistence | Inspected |
| Main Work screen live display | Implemented on `fix/work-live-km-classification` |
| Live trace noise filtering | Uses existing movement-accounting filter |
| Missing-routing-geometry handling | Corrected; regression tests added |
| Existing contract suite and production build | PASS on commit `be477dd3399442423504ae2bd7c0c2a8b377d0e3`: 95 contract suites, all 11 conformance steps, production PWA build, Pages runtime smoke, Android release/emulator smoke |
| Real Valhalla endpoint reachability/road accuracy | Not verified; adapter tests are mocked and endpoint was not reachable through the available verification tool |
| Android permission, screen-off/background continuity, and live overlay behavior | Requires physical-device/runtime evidence |
| End-to-end classification and persisted kilometres against a controlled drive | Requires runtime/device evidence |

## Acceptance scenarios before freezing this layer

1. Start shift, select Go to Pickup, and observe the live DEAD KM readout increase as GPS samples arrive.
2. Start Trip; the readout resets for the passenger segment and is labelled BUSINESS KM.
3. End Trip; confirm the saved trip KM has source/provenance, and compare GPS-line estimate with the road-matched route when valid geometry is returned.
4. Force routing timeout, invalid response, and missing geometry; confirm the trip transition still completes and fallback provenance is explicit.
5. Repeat with GPS permission denied, poor accuracy, screen locked, app backgrounded, and process restart. The UI must show acquisition/unavailable status rather than imply a valid distance when trace evidence is absent.
6. Reconcile a completed shift: total vehicle KM = closing odometer − starting odometer; business KM uses completed-trip values, dead KM is reconciled separately, and Personal KM is only the approved opening-gap allocation.

**Freeze rule:** do not mark this layer verified from source inspection or green CI alone. The branch must pass CI, then the real-device and route-service gates above must be recorded.

## Offline-first and incremental routing implementation

The follow-up implementation adds these behaviours:

- The Work screen calculates and displays the filtered GPS trace estimate immediately; it does not wait for a routing response.
- GPS trace collection/persistence remains local-first: browser trace points are written to IndexedDB, while Android's native foreground service writes its trace to an app-private JSONL file. Neither collector requires mobile data or Wi-Fi.
- While connectivity is available, Work attempts Valhalla trace matching no more frequently than every 30 seconds, and only treats a response as a road match when it includes valid matched LineString geometry. A validated live match is explicitly labelled **PROVISIONAL ROAD MATCH**; otherwise the screen retains **LIVE GPS ESTIMATE**.
- Completed trips whose canonical distance is currently GPS-line fallback are queued in local storage. Queue discovery runs at app startup and before retry; connectivity restoration triggers a forced retry. The queue is retained unless Valhalla returns a valid matched geometry and the canonical trip enrichment is saved.
- Reconciliation stores the accepted Valhalla distance and provenance, including the GPS-line fallback comparison, and removes the trip from the queue only after successful persistence. Re-running reconciliation is idempotent at the trip enrichment level; it replaces the provisional distance rather than adding it to totals.
- Queue retries are throttled to 30 seconds during ordinary Work refresh; connectivity restoration can trigger an immediate retry. Queue identifiers are persisted in local storage, while the trace evidence remains in IndexedDB/native JSONL so the queue can be rebuilt from saved completed trips if needed.

## Offline acceptance status

**Not yet proven on a physical Android device.** Automated contracts can verify source-level behavior, but cannot establish actual GPS continuity or local persistence on a particular handset. Required manual test:

1. Start a shift and pickup leg, disable Wi-Fi and mobile data, and verify the DEAD KM figure increases from locally captured GPS points.
2. Start a passenger trip with connectivity still disabled; verify BUSINESS KM starts for the passenger trace and continues increasing with the screen locked.
3. Background/interrupt KFE, resume it, and verify the native trace survives and no duplicate points are imported.
4. End the trip while offline; verify the saved trip keeps a clearly identified GPS-line provisional distance and the route reconciliation remains queued.
5. Restore connectivity; verify the queue retries, a valid Valhalla matched geometry is required before replacing the provisional canonical distance, and the trip is reconciled exactly once.
6. Repeat with routing unavailable, invalid response, missing geometry and weak/no GPS. No unavailable or provisional state may be presented as validated road distance.

