# KFE Native Canonical Persistence Phase — Progress Tracker

**Repository:** `amtalwalkar-sudo/KFE-New`  
**Implementation base:** `fix/native-overlay-background-transitions` at baseline `84cc80cdc7ecacf6f2ccfe971bb14b6fc4bed2a0`  
**Tracking branch:** `feat/native-canonical-persistence-phase`  
**Status:** Run 1 audit complete; implementation not started.

## Frozen scope

- One KFE application with browser PWA, Android-hosted PWA, and native Android overlay.
- Browser PWA keeps its IndexedDB adapter.
- Android PWA and native overlay use one authoritative native-backed business command/query/persistence boundary.
- Overlay operation must not depend on the PWA/WebView being open.
- No cross-device synchronization or Firebase in this phase.
- **Fuel is explicitly out of scope. Do not change fuel forms, logic, persistence, calculations, or tests.**
- Shift ending is end-odometer entry, validation and durable save, then shift ends. Permanently remove the end-of-shift date reconciliation workflow at code level. Preserve the rest of the established shift workflow.

## Seven-run execution plan

1. **Audit current branch, canonical persistence boundary and existing data models** — source-backed baseline, gaps and current CI/branch status.
2. **Implement the canonical command/query/persistence boundary** — stable operation IDs, validation, atomic durable outcomes/audit, idempotency and read APIs; keep browser IndexedDB adapter.
3. **Implement safe, idempotent Android data migration** — shifts, trips, fare/cancellation records, pending mutations, audit and GPS evidence; verify before switching reads/writes and retain source evidence until verified.
4. **Integrate fare and cancellation workflows end to end** — overlay submission, durable canonical save, PWA read models, downstream calculations, retry/recovery and duplicate protection.
5. **Fix timer authority and recovery** — durable transition timestamps, wall-clock-derived elapsed time, native redraw and protection from stale PWA snapshots.
6. **Fix native GPS lifecycle and telemetry** — canonical-transition ownership, correct dead/passenger trace selection, status/accuracy/distance telemetry, idempotent trace import and evidence retention.
7. **Remove end-of-shift date reconciliation and perform final acceptance/release verification** — end odometer is the final driver-facing step; full regression/migration/offline/recovery/Android instrumentation, production build, CI and APK artifact verification.

Run tests relevant to a change during that run; Run 7 also performs the consolidated release gate. Do not merge or request physical-device sign-off until required automated checks and APK verification are recorded.

## Run 1 — Audit result

**Completed from source inspection only; no runtime code changed.**

- `src/repositories/shiftTripRepository.js`: shift/trip business mutations use IndexedDB read-write transactions with pending mutation and audit records. `completeShift` currently accepts and stores more than end odometer, including shift revenue/toll/parking and revenue reconciliation metadata.
- `src/utils/indexedDB.js`: canonical IndexedDB schema version is 15; stores include shifts, trips, pending mutations, audit history, GPS snapshots and movement artifacts. Android business records currently have no demonstrated shared native canonical store.
- `src/application/work/workRuntimePorts.js`: ports exist for movement trace, native GPS, native work actions, overlay, routing and platform, but no canonical Work command/query/persistence port.
- `KfeNativeEventStore.java`: SQLite table `native_events` persists queued action transport state (ID, stage, trip ID, input, timestamp, status, attempts and error); it is not canonical shift/trip business storage.
- `KfeNativeWorkActionsPlugin.java`: exposes pending-action replay and acknowledgement; acknowledgement alone does not prove a business mutation committed.
- `src/views/WorkModuleView.vue` is the JavaScript action consumer that invokes Work service methods, so canonical mutation can depend on the PWA view running.
- `src/application/work/endShift.js`: current end-shift path requires shift revenue and invokes revenue reconciliation. This must be reconciled with the frozen odometer-only driver workflow without removing financial data/calculations needed elsewhere.
- `src/infrastructure/android/nativeGpsService.js` already includes trace de-duplication and verification-before-clear patterns; preserve and extend only where needed for the agreed GPS boundary.
- `src/constants/canonicalDatabase.js` sets `CANONICAL_DB_VERSION = 15`.
- The runtime branch head was confirmed as `84cc80cdc7ecacf6f2ccfe971bb14b6fc4bed2a0`. The last recorded combined status query for that commit returned no status entries, so CI is **unknown**, not green.
- Existing draft documentation PR #293 is open and unmerged; it is documentation-only and is not implementation evidence.

## Progress ledger

| Run | Status | Evidence / exit criteria |
|---|---|---|
| 1 — Source audit | **Complete** | Findings above; no runtime code changed |
| 2 — Canonical boundary | Not started | Shared command/query contract, native persistence and focused tests |
| 3 — Migration | Not started | Idempotent migration and verification tests |
| 4 — Fare/cancellation | Not started | Overlay save visible in PWA and calculations exactly once |
| 5 — Timer | Not started | Restart/background and stale-snapshot tests |
| 6 — GPS | Not started | Trace lifecycle, distance-type and recovery tests |
| 7 — Shift-end removal + release gate | Not started | Reconciliation code removed; full test/build/CI/APK evidence |

Update this ledger at the end of every run with changed files/commit, checks actually executed, failures/blockers, and the next run. Never mark a check green unless its result is available.
