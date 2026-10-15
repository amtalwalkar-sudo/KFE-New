# KFE Native Canonical Persistence Phase — Progress Tracker

**Repository:** `amtalwalkar-sudo/KFE-New`  
**Implementation base:** `fix/native-overlay-background-transitions`  
**Tracking branch:** `feat/native-canonical-persistence-phase`  
**Status:** CI [#4126](https://github.com/amtalwalkar-sudo/KFE-New/actions/runs/38803856177) is green: `build-and-test` and `android-release-gate` passed, including the exact-APK smoke gate and tested APK artifact. Runs 5 and 6 have automated CI coverage; Run 7 implementation is complete in this commit series. Physical-device validation remains pending.

## Frozen scope

- One KFE application with browser PWA, Android-hosted PWA, and native Android overlay.
- Browser PWA retains its IndexedDB adapter.
- Android PWA and native overlay are intended to use one authoritative native-backed business command/query/persistence boundary.
- Overlay operation must not depend on the PWA/WebView being open.
- No cross-device synchronization or Firebase in this phase.
- **Fuel is explicitly out of scope. Do not change fuel forms, logic, persistence, calculations, or tests.**
- Shift ending is end-odometer entry, validation and durable save, then shift ends. Permanently remove the end-of-shift date reconciliation workflow at code level in Run 7.

## Seven-run execution plan

1. **Audit current branch, canonical persistence boundary and existing data models** — complete.
2. **Implement the canonical command/query/persistence boundary** — stable operation IDs, validation, atomic durable outcomes/audit, idempotency and read APIs; browser IndexedDB adapter retained.
3. **Implement safe, idempotent Android data migration** — shifts, trips, pending mutations, audit history, GPS snapshots/traces and movement artifacts; verify before switching reads/writes and retain source evidence until verified.
4. **Integrate fare and cancellation workflows end to end** — overlay submission, durable canonical save, PWA read models, downstream calculations, retry/recovery and duplicate protection.
5. **Fix timer authority and recovery** — durable transition timestamps, wall-clock-derived elapsed time, native redraw and protection from stale PWA snapshots.
6. **Fix native GPS lifecycle and telemetry** — canonical-transition ownership, correct dead/passenger trace selection, status/accuracy/distance telemetry, idempotent trace import and evidence retention.
7. **Remove end-of-shift date reconciliation and perform final acceptance/release verification** — end odometer is the final driver-facing step; remove reconciliation code rather than hide it; run consolidated regression, migration, offline/recovery and Android instrumentation tests, production build, CI and APK artifact verification.

Do not merge or request physical-device sign-off until required automated checks and APK verification are recorded. Run 3 only adds migration and verification; it does not switch repository reads/writes. Later runs perform the cutover after migration evidence is accepted.

## Run 1 — Audit result

**Complete from source inspection; no runtime code changed.**

- `src/repositories/shiftTripRepository.js`: shift/trip business mutations use IndexedDB read-write transactions with pending mutation and audit records. `completeShift` currently accepts and stores more than end odometer, including shift revenue/toll/parking and revenue reconciliation metadata.
- `src/utils/indexedDB.js`: the pre-Run-2 canonical schema was version 15; stores include shifts, trips, pending mutations, audit history, GPS snapshots and movement artifacts.
- `src/application/work/workRuntimePorts.js`: there was no canonical Work command/query/persistence port.
- `KfeNativeEventStore.java`: SQLite `native_events` persists queued action transport state; it is not canonical shift/trip business storage.
- `KfeNativeWorkActionsPlugin.java`: pending-action replay and acknowledgement do not themselves prove a business mutation committed.
- `src/views/WorkModuleView.vue` is the JavaScript action consumer invoking Work service methods, so canonical mutation can depend on the PWA view running.
- `src/application/work/endShift.js`: the current end-shift path requires shift revenue and invokes revenue reconciliation; Run 7 must remove the driver-facing end-shift reconciliation workflow without deleting financial data/calculations needed elsewhere.
- `src/infrastructure/android/nativeGpsService.js` already includes trace de-duplication and verification-before-clear patterns; preserve and extend these only where required by the agreed GPS boundary.

## Run 2 — Canonical boundary

**Complete; CI Run #4059 passed.**

- Added `KfeCanonicalWorkStore` SQLite persistence with canonical record, operation-outcome and audit tables. Record mutation, operation result and audit row commit in one transaction.
- Stable operation IDs replay prior outcomes; reusing an ID for a different command/entity is rejected.
- Added `KfeCanonicalWorkPlugin`, registered it in `MainActivity`, and added native/browser adapters, runtime port and shared `CanonicalWorkBoundary`.
- Added IndexedDB `canonical_operations` and raised canonical schema to v16 (synthetic DB to v15), plus contract/version migration updates.
- Existing Work repositories are **not** yet switched to native persistence; the new boundary is not proof that overlay and PWA already share business state.
- No fuel files, fuel logic, fuel persistence, calculations or fuel tests were changed.
- Draft PR: [#294](https://github.com/amtalwalkar-sudo/KFE-New/pull/294), branch `feat/native-canonical-persistence-phase`, base `fix/native-overlay-background-transitions`.
- CI Run [#4059](https://github.com/amtalwalkar-sudo/KFE-New/actions/runs/38787895007), commit `53f7fd6bd4fb61f98bd64f838cff4c64aca389d9`: **build-and-test passed** and **android-release-gate passed**, including Android exact-APK smoke gate and APK/release identity artifact uploads. Deployment was skipped.

## Run 3 — Safe, source-preserving migration

**Implementation and contract validation passed in CI #4125; no cutover performed. Native-device migration acceptance remains part of final release verification.**

- `KfeCanonicalWorkStore.java`: added a migration ledger and per-record verification manifest, SHA-256 payload checks, transactional import, conflict rejection when a native record already exists with different content, and an upgrade path from native DB version 1 to 2.
- `KfeCanonicalWorkPlugin.java`: exposes migration, verification and migration-status queries.
- `nativeCanonicalWork.js`: exposes the corresponding Android bridge methods.
- Added `nativeCanonicalMigration.js`: snapshots the canonical IndexedDB source stores for shifts, trips, GPS snapshots, movement artifacts, pending mutations, audit history and canonical operation outcomes; validates stable record IDs; sorts records deterministically; imports and verifies them; reports `sourcePreserved: true` and `cutoverPerformed: false`.
- Source IndexedDB is never deleted or rewritten by this migration. A different source snapshot under the same migration ID is rejected, and conflicting native records fail rather than being overwritten.
- Added `nativeCanonicalMigration.contract.js` and registered it in `runAllContracts.js`.
- Fuel is not part of the migration snapshot.
- Latest known Run 3 implementation commit before this tracker update: `d94494d7a2a052f66400d023b3415be13dd07987`. CI for the new migration code has not yet been confirmed.

## Run 4 — Native fare/cancellation commit integration

**Current implementation passed CI Run #4079, including the Android exact-APK smoke gate.**

- `KfeOverlayService.java` now creates the durable form event and writes the fare/cancellation trip snapshot to `KfeCanonicalWorkStore`; only after the canonical commit succeeds does it emit the event and dismiss the form.
- Fare stores completion status, fare/skipped-fare state, toll/parking values and treatment flags. Cancellation stores cancelled status, reason and optional cancellation fee.
- Stable per-trip form operation IDs prevent duplicate canonical commits. If canonical save fails, the form remains available for retry.
- `WorkModuleView.vue` mirrors the resulting trip snapshot into the native canonical store during PWA replay and passes the durable event ID through the replay path.
- Added the native overlay fare/cancellation contract and Android instrumentation assertions for the stored records.
- **Scope of the green result:** CI passed contract suites, production PWA/runtime checks, and exact-APK Android instrumentation. Full physical-device validation remains pending until merge. This is not yet a claim that every possible interrupted/conflicting native↔IndexedDB reconciliation has been exhaustively proven.

## Run 5 — Timer authority and recovery

**Complete; CI #4091 passed.**

- Persist the trip-start wall-clock timestamp and the trip ID together in native preferences when the native `START_RIDE` transition commits.
- Restore the timer from the durable timestamp after service/process recovery rather than trusting an absent or stale PWA snapshot.
- Protect an active native `END_RIDE` state from a stale PWA snapshot that still reports `START_RIDE`, but only when the saved timer and incoming state identify the same trip.
- Clear the active timer when `END_RIDE` commits and the workflow advances to fare entry.
- Added Android instrumentation coverage that injects a stale PWA snapshot and asserts that native stage, trip identity and original timer timestamp remain authoritative.
- CI #4083 exposed a stale exact-APK expected count (16 versus 17 reported tests); the count was corrected, and Run 6's added GPS lifecycle test brought the expected overlay count to 18.
- CI Run [#4091](https://github.com/amtalwalkar-sudo/KFE-New/actions/runs/38795165779) passed both `build-and-test` and `android-release-gate`, including the corrected exact-APK smoke gate. Timer recovery and stale-snapshot protection are therefore CI-verified; physical-device testing remains pending.

## Run 6 — Native GPS lifecycle and telemetry

**Implementation and automated CI verification passed in CI #4125; physical-device lifecycle acceptance remains pending.**

- Native overlay transitions now own GPS start/stop rather than relying on the PWA action consumer: after `GO_TO_PICKUP`, start `DEAD_MOVEMENT_TRACE`; after `START_RIDE`, switch the same trip collector to `PASSENGER_RIDE_TRACE`; after `END_RIDE`, stop the matching trip collector.
- The same GPS transition hooks are applied when a durable PWA acknowledgement restores/advances the overlay stage. Starting the same trip/type is idempotent in `KfeNativeGpsService.startTracking`; changing event type restarts collection for the same trip.
- Cancellation stops the collector for the cancelled trip while retaining its raw trace evidence; the GPS stop path is trip-ID guarded so a stale stop cannot terminate a newer trip.
- Added `gpsEventForAction` to make the dead-movement/passenger-trace mapping explicit, and `persistedActiveEventType` for instrumentation verification.
- Added Android instrumentation coverage for dead-movement collection on pickup travel, switching to passenger-trip telemetry at Start Trip, and stopping the same collector at End Trip.
- Existing native trace JSONL persistence, de-duplication, import read-back verification and clear-after-verified-import behavior remain intact; this run must still verify lifecycle recovery and telemetry behavior in CI.

## Run 7 — Odometer-only shift end and final acceptance

**Complete; the tracker commit itself passed CI #4126.**

- Removed the shift-end shift-revenue input, trip-fare review list, shift toll/parking capture, and the multi-stage reconciliation/review/confirmation flow from `WorkContextForm.vue`, `WorkEndShiftForm.vue`, and `WorkModuleView.vue`.
- The driver-facing end-shift path now validates the closing odometer, retains the explicit confirmation gate for unusually large distance, and commits the odometer plus shift lifecycle/audit state.
- `src/application/work/endShift.js` no longer requires shift revenue, applies fare corrections, or calculates revenue reconciliation. `ShiftTripRepository.completeShift` no longer mutates trip fare records or overwrites existing shift financial fields during closure.
- Existing shift financial authority and trip fare/cancellation records are preserved. Trip fare corrections and financial read-model recalculation remain separate from shift closure.
- Native GPS trace import and movement accounting remain internal to shift completion so persisted mileage evidence is retained without asking the driver to perform a reconciliation workflow.
- Updated regression contracts and browser integration scenarios to verify odometer-only closure, preserved financial fields, trip fare edits outside shift closure, GPS/movement read-model consistency, and the intentionally blank Timeline/Performance presentation surfaces.
- CI [#4126](https://github.com/amtalwalkar-sudo/KFE-New/actions/runs/38803856177) passed `build-and-test` and `android-release-gate`, including semantic control audit, Phase 4 cross-surface lifecycle and boundary continuity, production PWA runtime checks, Android instrumentation on the exact built APK, and tested APK artifact upload.
- Physical-device testing is still pending until after merge. No merge has been performed.

## Progress ledger

| Run | Status | Evidence / exit criteria |
|---|---|---|
| 1 — Source audit | **Complete** | Source-backed findings above |
| 2 — Canonical boundary | **Complete; CI green** | CI #4059 build/test and Android release gate passed |
| 3 — Migration | **Contract CI passed; no cutover** | Migration contract suite passed in #4125; source remains preserved and native-device migration acceptance remains in final release verification |
| 4 — Fare/cancellation | **CI passed (Run #4079)** | Native canonical write plus durable PWA replay; full physical-device validation remains pending |
| 5 — Timer | **Complete; CI green** | Stale-snapshot/timer recovery instrumentation plus corrected exact-APK gate passed in #4091 |
| 6 — GPS | **Implementation and CI green; device check pending** | GPS lifecycle instrumentation and exact-APK gate passed in #4125; physical-device validation remains pending |
| 7 — Shift-end removal + release gate | **Complete; CI #4126 green** | Removed shift-end revenue/review stages and reconciliation code from the driver flow; end odometer is the final input; financial records are preserved; regression/integration suites and exact-APK smoke passed. Physical-device acceptance remains pending. |

At the end of each run, record changed files/commit, checks actually executed, failures/blockers and next run. Never mark a check green unless its result is available.
