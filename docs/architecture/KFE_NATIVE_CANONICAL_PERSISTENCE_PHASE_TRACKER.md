# KFE Native Canonical Persistence Phase — Progress Tracker

**Repository:** `amtalwalkar-sudo/KFE-New`  
**Implementation base:** `fix/native-overlay-background-transitions`  
**Tracking branch:** `feat/native-canonical-persistence-phase`  
**Status:** Runs 1–4 have passed their current CI gates; Run 5 timer recovery implementation is in progress and CI Run #4082 is pending.

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

**Implementation drafted; CI and runtime validation pending. No cutover performed.**

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

**Implementation in progress; CI Run #4082 pending.**

- Persist the trip-start wall-clock timestamp and the trip ID together in native preferences when the native `START_RIDE` transition commits.
- Restore the timer from the durable timestamp after service/process recovery rather than trusting an absent or stale PWA snapshot.
- Protect an active native `END_RIDE` state from a stale PWA snapshot that still reports `START_RIDE`, but only when the saved timer and incoming state identify the same trip.
- Clear the active timer when `END_RIDE` commits and the workflow advances to fare entry.
- Added Android instrumentation coverage that injects a stale PWA snapshot and asserts that native stage, trip identity and original timer timestamp remain authoritative.
- Awaiting CI verification of Java compilation, Android instrumentation and the exact built APK before marking Run 5 complete.
## Progress ledger

| Run | Status | Evidence / exit criteria |
|---|---|---|
| 1 — Source audit | **Complete** | Source-backed findings above |
| 2 — Canonical boundary | **Complete; CI green** | CI #4059 build/test and Android release gate passed |
| 3 — Migration | **Implemented draft; validation pending** | Native migration ledger, deterministic source snapshot, idempotent import, read-back verification, source retention and contract test; wait for CI and fix failures |
| 4 — Fare/cancellation | **CI passed (Run #4079)** | Native canonical write plus durable PWA replay; full physical-device validation remains pending |
| 5 — Timer | Not started | Restart/background and stale-snapshot tests |
| 6 — GPS | Not started | Trace lifecycle, distance-type and recovery tests |
| 7 — Shift-end removal + release gate | Not started | Reconciliation code removed; end odometer is final driver-facing step; full test/build/CI/APK evidence |

At the end of each run, record changed files/commit, checks actually executed, failures/blockers and next run. Never mark a check green unless its result is available.
