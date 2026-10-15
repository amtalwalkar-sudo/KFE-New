# KFE Repository Boundary Audit Against the Platform Storage and Command Contract

**Status:** Source audit; no runtime implementation included.  
**Audited branch:** `fix/native-overlay-background-transitions` (the source branch used for the native timer/GPS audit).  
**Contract:** `docs/architecture/KFE_PLATFORM_STORAGE_AND_COMMAND_CONTRACT.md`  
**Scope exclusion:** Cross-device synchronization and Firebase are not current requirements and were not audited as implementation gaps.

## Executive finding

The repository already has useful pieces—domain validation, a Work service, a transactional IndexedDB repository, Capacitor native plugins, a durable SQLite native-action queue, and a native GPS foreground service. The missing boundary is the key issue: these pieces do not yet form one platform-aware canonical command/query path shared by the Android overlay and Android PWA.

The current overlay queue is durable transport, not canonical Work persistence. PWA JavaScript consumes that queue and performs the actual business mutation in IndexedDB. Native overlay progression and canonical records can therefore diverge while the PWA is closed or suspended.

## Boundary-by-boundary findings

| Area | Existing boundary observed in source | Assessment against contract |
|---|---|---|
| Domain/workflow rules | `src/application/work/workService.js` imports domain validators and calls `ShiftTripRepository`; lifecycle transitions use domain functions such as `transitionTrip` / `transitionTripStage`. | **Partially aligned.** Reusable rules exist, but the authoritative command execution path is still in the JS/PWA runtime. Audit and reuse these rules through a shared command contract rather than duplicating them in Java. |
| Canonical Work repository | `src/repositories/shiftTripRepository.js` opens IndexedDB through `initializeCanonicalStorage()`; mutations use IndexedDB read-write transactions involving business stores, `pending_mutations`, and `audit_history`. | **Confirmed gap on Android.** This is a useful browser persistence implementation, but the native overlay cannot transact against this IndexedDB repository when the WebView is not executing. |
| IndexedDB storage abstraction | `src/utils/indexedDB.js` defines the canonical DB, stores, initialization, and browser change notifications through window events / `BroadcastChannel`. | **Confirmed gap.** The current abstraction is browser-native IndexedDB, not a platform adapter that can route Android commands/queries through native canonical storage. Browser notifications do not bridge the overlay to native SQLite canonical records. |
| Work runtime ports | `src/application/work/workRuntimePorts.js` validates ports for movement trace, native GPS, native work actions, overlay, routing, and platform. It has no canonical Work command/repository port. | **Confirmed gap.** Add a deliberate Work command/query/persistence port and platform adapter; avoid adding more one-off overlay methods as a substitute. |
| Native action queue | `KfeNativeEventStore.java` stores event ID, stage, trip ID, input, creation time, attempts, error, and acknowledgement in SQLite. `KfeNativeWorkActionsPlugin.java` exposes pending events and acknowledgements. | **Confirmed gap, not a defect in its intended role.** This is a durable action queue, not canonical shift/trip/fare/cancellation/fuel data. Queue acknowledgement only records transport status; it does not make the canonical business transaction atomic. |
| Native overlay workflow | `KfeOverlayService.java` stores stage and selected IDs in SharedPreferences, renders controls, and appends actions to the native queue. | **Confirmed gap.** It can maintain recoverable presentation/workflow state, but it cannot treat its local stage as proof that a canonical business mutation has committed. |
| PWA event consumption | `src/views/WorkModuleView.vue` processes native work actions in the Work view and calls Work service methods. | **Confirmed gap.** Canonical mutation still depends on the Work view/JavaScript consumer running. This conflicts with overlay-only full-shift operation. |
| GPS collector | `KfeNativeGpsService.java` is a native foreground location service and writes trace evidence to a JSONL file; its active owner/event type are persisted. | **Partially aligned.** Native collection and evidence recovery exist, but the canonical Work transition path does not yet own the full collector lifecycle. OS permissions/provider/OEM behavior still needs device validation. |
| GPS orchestration and trace import | `WorkService` starts/switches native GPS during JS trip actions and imports native trace files into `LocationRepository`; `androidOverlayLifecycle.js` derives overlay display state by reading Work service and calculating trace distances. | **Confirmed gap.** Starting/switching collection and read-model refresh depend on PWA JS execution. This is not sufficient for overlay-only operation. |
| Timer authority | `KfeOverlayService` maintains an in-memory timer start and redraws by stage; PWA snapshots can update overlay state. | **Confirmed gap.** Timer timestamp must be committed with the canonical transition and shared by both interfaces; redraw must be independent of WebView scheduling. See the linked timer/GPS root-cause audit. |
| Android PWA to native storage bridge | Capacitor plugins exist for native actions, overlay, and GPS, but the inspected Work runtime ports do not expose a native canonical repository/command boundary. | **Confirmed gap.** Add the bridge contract for canonical Work commands/queries and wire Android PWA repositories through it. Keep IndexedDB as the browser adapter. |
| Data migration | Existing canonical records, pending mutations, audit history, and GPS snapshots are in IndexedDB; native GPS raw evidence may also exist in JSONL files. | **Not yet demonstrated.** Before switching Android persistence, implement and test idempotent migration with provenance and active-shift conflict handling. Do not delete source data until verification passes. |

## Required target boundary

1. Define a platform-neutral Work command/query contract at the application boundary.
2. Implement a browser adapter backed by current IndexedDB repositories.
3. Implement an Android adapter backed by one native canonical persistence service/database, exposed to the Capacitor PWA and usable by native overlay/GPS code.
4. Make the overlay call the same native command boundary directly; do not rely on event replay by `WorkModuleView.vue` to commit a trip.
5. Make native canonical transitions coordinate timer timestamps and GPS lifecycle.
6. Provide consistent read models so PWA and overlay render canonical state plus explicit pending/error telemetry.
7. Migrate current Android IndexedDB records idempotently and preserve audit/mutation/GPS evidence.

## Recommended implementation order

1. **Contract and repository port** — define command/query methods, payloads, validation outcomes, stable operation IDs, timestamps, idempotency and read-model schemas.
2. **Android canonical persistence** — native schema, transactional commands, durable outcomes, audit records, migration and query API.
3. **PWA adapter wiring** — browser remains IndexedDB-backed; Android-hosted PWA routes the same repository/command interface to native canonical persistence.
4. **Overlay integration** — use native canonical commands and render accepted state/results; queue becomes optional transport/recovery detail, not the business authority.
5. **GPS + timer integration** — tie capture lifecycle and persisted timer timestamps to canonical transitions; expose live telemetry and fix dead/business distance selection.
6. **Contract tests and acceptance tests** — test both adapters, idempotent retry, interruption recovery, overlay-only multiple trips, form saves, timer and GPS.
7. **CI/APK verification and device acceptance** — green automated gates and verified APK before merge; then physical-device checks for screen-off/background/restart and OEM behavior.

## Confidence and limits

These findings are based on source boundaries on the audited branch, not a live device trace. The architecture mismatch and missing canonical Work port are source-confirmed. Exact timer behavior, GPS fix quality, and Android OEM/background restrictions still require runtime logs and physical-device acceptance after implementation.
