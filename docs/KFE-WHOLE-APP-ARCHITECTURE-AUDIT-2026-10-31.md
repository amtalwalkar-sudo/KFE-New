# KFE PWA + Capacitor Whole-Application Architecture Audit

**Date:** 2026-11-01  
**Branch / PR:** `fix/simple-four-event-gps-capture` / PR #412  
**Status:** Implementation and regression verification in progress; physical-device verification remains separate.

## Objective

Keep one understandable PWA + Capacitor architecture for the agreed product scope: Work/ride workflow, Timeline, basic recorded-data Performance, basic Admin forms/data, and the native Android ride overlay. Remove redundant execution paths and obsolete behavior without deleting historical business records or changing ride timestamps.

## Ownership model verified

- `src/main.js` is the JavaScript composition root. It configures runtime adapters before the Vue app is mounted and starts the single startup lifecycle.
- Presentation owns Vue components, shell, transient view state, and reactive subscriptions.
- Application owns use cases, orchestration, workflow gates, and application-owned runtime-port contracts.
- Domain owns trip lifecycle rules, odometer validation, canonical record factories, and deterministic calculations.
- Repositories own IndexedDB transactions, mutation/audit coupling, relationship checks, and the browser read/write boundary.
- Infrastructure owns Capacitor plugin registration, browser/native adapters, service-worker registration, backup-provider adapters, and platform translation.
- Android native code owns Android-only overlay behavior, native durable event queues, native SQLite commits, permission APIs, and event-time GPS capture.
- Browser PWA uses IndexedDB as its durable store. Android Work/GPS uses SQLite as its durable store and synchronizes the PWA read model. These are two physical stores for one logical canonical record history.

## Findings and changes

### 1. Application services were coupled to Vue reactivity

**Finding:** Startup and permission-gate application services imported `reactive` from Vue. This made application orchestration depend on the presentation framework.

**Change:** Application services now publish plain state snapshots through subscription functions. `src/presentation/startup/useStartupUiState.js` owns Vue reactivity and subscribes to those snapshots. `App.vue` consumes that presentation state. The architecture contract now prohibits Vue/Pinia imports from the Application layer.

### 2. PWA fare/cancellation replay performed a second native canonical write

**Finding:** The fare/cancellation path committed through `WorkService`, then the Work view issued a second `CanonicalWorkBoundary.putRecord` using the native event ID. This split one logical save into two writes and could advance the record twice during replay.

**Change:** The durable native event ID now flows through the Work view → Pinia store → WorkService → single native canonical commit. The second UI-owned write was removed. Regression contracts require one canonical write for fare and cancellation replay.

### 3. Generic trip-correction APIs obscured the actual workflow

**Finding:** The completed-trip fare form used generic `updateTrip` / `validateTripCorrection` names and accepted fields beyond the active fare-details workflow.

**Change:** The API is now `saveTripDetails` / `validateTripDetails`. It is restricted to completed trips and the active fare/toll/parking/fare-skipped fields. Cancellation remains its own lifecycle transition. This is not a historical correction interface.

### 4. Duplicate JavaScript revenue formula

**Finding:** The browser canonical adapter maintained a second fare/cancellation revenue formula instead of using the domain rule. It also treated numeric strings differently from the domain calculation.

**Change:** Browser canonical projection now calls the single domain `deriveLiveRevenue` function. The native SQLite transaction retains a small Java-side projection because native overlay form commits must atomically update the shift projection even while the PWA is unavailable. That native mirror is a storage-transaction invariant, not a second user-facing calculation service; native acceptance tests cover fare, cancellation, skipped fare, and idempotent retry behavior.

### 5. Retired Work accounting and movement paths

Removed active code/wiring for:
- Personal KM / Dead KM odometer-gap classification;
- gap-allocation validation and its generic rule interpreter/specification;
- movement-reconciliation writes;
- dead shift-revenue reconciliation API;
- trip-distance correction/authority handling.

The active Work start path now validates and saves the shift opening odometer only. Fuel odometer readings remain available for fuel calculations. Existing business records and ride timestamps were not edited.

### 6. Capacitor registration and layer registry

- JavaScript plugin registration remains centralized in `src/infrastructure/capacitor/nativePluginRegistry.js`.
- Android plugin registration remains centralized in `MainActivity`.
- The architecture contract compares both registrations and requires the same seven active plugin capabilities.
- The machine-readable layer registry now accurately allows infrastructure adapters to import application-owned port contracts and inward domain primitives. Application remains prohibited from importing infrastructure, browser persistence, Capacitor plugins, Vue, or Pinia.

## Intentionally retained

- Legacy IndexedDB stores and legacy backup formats remain available for compatibility and recovery. Historical driver-target, break-even, day, odometer-gap, movement-artifact, settlement, and financial snapshot records are not exposed as active workflows or calculations. The canonical data contract requires preserving legacy records during scope cleanup and backup/restore.
- The obsolete movement-artifact entity is no longer accepted by the active browser canonical write adapter; its historical store remains only for legacy backup compatibility.
- Dropbox remains a live-app/WebView backup provider. No native background connectivity polling or service-worker upload loop was introduced.
- Native event capture remains bounded and event-driven; no continuous GPS tracking or idle retry loop was added.

## Follow-up audit — 2026-11-01

### 7. Application/platform boundary leak

**Finding:** The Timeline read model and locality-resolution application service read `navigator.onLine` directly. This was a browser-platform dependency inside Application and was not rejected by the previous import-only boundary check.

**Change:** Connectivity status now comes from the application-owned `WorkRuntimePorts.platform.isOnline()` contract, implemented by `PlatformStartup`. Timeline and locality services no longer read browser globals. The architecture contract now rejects direct browser-global access from Application.

### 8. Stale end-to-end workflow evidence

**Finding:** The Golden Ride scenario still described the retired odometer-gap gate, reconciliation and shift-review stages. An unused Phase D cross-surface display test also referenced deleted calculation services and the retired Performance surface.

**Change:** The Golden Ride now follows the current lifecycle only: PWA Shift start, four ride events across PWA/overlay, fare or explicit skip, and PWA Shift end. Regression assertions reject the retired stages. The unreferenced Phase D display test was deleted. The form end-to-end chain label now says End Shift, not End Shift/Reconciliation.

### 9. Active calculation inventory

The active calculation surface is intentionally small:

- `src/domain/math/fuel.js` — fuel quantity, full-tank interval cost/km and selected-period fuel summary.
- `src/domain/performance/phaseOneOverview.js` — read-only basic Performance projection from saved Shift/Trip and fuel facts.
- `src/application/performance/phaseOnePerformanceService.js` — reporting-period orchestration and repository read.
- `src/domain/work/liveRevenue.js` — canonical Shift revenue projection from eligible completed fares and cancellation fees; mirrored transactionally by native SQLite for Android commits.

No active domain finance/loan engine, forecast, break-even, driver-target, provision, amortization or maintenance-projection calculation remains. The Admin Loan form stores contractual source facts only; it does not calculate EMI, repayment schedules or balances. This is separate from Basic Performance, which uses only saved ride/cancellation and fuel facts.

### 10. End-to-end runtime wiring

- `src/main.js` installs the PWA/native runtime adapter before router creation and Vue mount.
- The single JavaScript Capacitor registry and Android `MainActivity` each register the same seven native capabilities.
- PWA Work commands flow through the application Work service and canonical repository/port boundary. Android overlay ride commands enter the durable native action journal, replay through the PWA application command path, and are acknowledged only after canonical commit.
- Android SQLite is the durable Work/GPS commit store; PWA IndexedDB is the browser canonical store and Android read-model projection.
- Native GPS is isolated to the four event snapshots; PWA locality lookup is explicit Timeline pull-to-refresh only.
- Dropbox remains an app/WebView backup integration. No native background upload or service-worker cloud polling path is part of this architecture.

### 11. Work UI state was in the wrong layer

**Finding:** The Work timer identity and interrupted-form session marker were stored in `application/work/workflowTimerService.js` using browser `localStorage`. These are presentation restoration hints, not application business rules or canonical records.

**Change:** The module now lives at `presentation/workflowUiState.js`, and WorkModuleView consumes it from the presentation layer. Form field drafts remain with the shared form-draft application/repository path. The application layer is now guarded against direct browser-global storage and platform access, and the architecture contract enforces this ownership.

### 12. Duplicate native revenue projection implementation

**Finding:** Android SQLite had two separate Java implementations of the same Shift revenue projection: one for ordinary Trip writes and another inside native fare/cancellation form commits. The PWA domain formula was already the semantic authority, but the native persistence mirror was duplicated internally and could drift.

**Change:** Both native write paths now call the single `refreshShiftRevenueProjection` helper. The native persistence contract verifies that only one revenue aggregation implementation exists and that native fare/cancellation commits reuse it. The architecture and canonical-data contracts now state the narrow exception clearly: native SQLite mirrors the exact domain rule transactionally for offline native overlay commits; it is not allowed to introduce a second financial rule or metric.

### 13. Obsolete form save-path evidence

**Finding:** `docs/PWA-FORM-SAVE-PATH-MATRIX.md` described retired first-run, break-even, driver-target, calculations and reconciliation surfaces, and its baseline was from an older application architecture.

**Change:** The obsolete matrix was removed. The current form architecture remains defined by the Admin extensibility contract, universal form contract, application/repository save paths and active regression tests.

### 14. Native-first command ownership clarified

**Finding:** The architecture/lifecycle prose had claimed that native overlay actions passed through the PWA WorkService command path. The implementation correctly supports native-first commits while the WebView is unavailable; the PWA later replays the durable event to synchronize and acknowledge, without creating a second commit when the native operation already exists.

**Change:** The current architecture and lifecycle contracts now describe the actual split: PWA actions use WorkService; Android overlay actions use the native command/SQLite transaction adapter; both preserve one canonical Shift/Trip model and one record history. Shift start/end remain PWA-owned. End-to-end assertions now verify native lifecycle commit and durable event publication separately.

### 15. Fuel calculation surface simplified

**Finding:** The fuel store and WorkService still computed and retained unused rolling cost/km, latest mileage, average mileage and per-kg metrics. No current screen consumed these values; the active reporting requirement is selected-period fuel spending plus full-tank interval cost/km.

**Change:** Removed the unused rolling-metric API and store state. Fuel domain math now exposes only quantity conversion and the selected-period full-tank cost/km summary. Partial refills remain included in period spending but never create mileage intervals. Added a focused fuel domain contract covering baseline readings, partial refills, vehicle separation, weighted interval cost/km and missing intervals.

### 16. Cancellation fee calculation corrected

**Finding:** Basic Performance previously fell back from a missing `cancelledRevenue` to the cancelled Trip's `revenue` field. That could incorrectly reuse a prior fare as a cancellation fee, contrary to the canonical rule that a missing cancellation fee is ₹0.

**Change:** Performance now reads only `cancelledRevenue` for cancellation fees. A regression test proves a legacy cancelled Trip with a fare field but no cancellation fee contributes zero.

### 14. Supporting UI and Android acceptance contracts contradicted current architecture

**Finding:** The authoritative UI shell contract still described a single shared command path, old odometer-gap/reconciliation/shift-review stages, target/progress context, and Auto/Light/Dark themes. The Android physical-device runbook still required continuous dead-movement traces, trace-distance checks and reconciliation. The end-to-end matrix and frozen overlay requirement also said native submissions depended on PWA command processing/acknowledgement before becoming business commits. These statements contradicted the current native-first Android transaction design and simplified product.

**Change:** The UI shell contract now documents distinct PWA and native command adapters over the same domain invariants and canonical record model, Dark Only, and the current Work lifecycle. The end-to-end matrix and frozen overlay requirement now describe atomic native SQLite commits followed by PWA synchronization/acknowledgement. The Android acceptance runbook was rewritten around four event-time GPS snapshots, offline operation, manual-only locality refresh, native commit/recovery, current Performance/Admin, and backup/reset acceptance. Retired movement-trace, ride-distance and reconciliation checks were removed. The UI shell regression contract now rejects the obsolete wording.

### 15. Release-phase status consistency

**Finding:** Launch status showed Phase 11 physical-device pilot as active while Phase 10 release-candidate freeze remained pending and Phase 5 cleanup was still in progress.

**Change:** Status now correctly identifies Phase 5 as active, requires fresh CI on the final cleanup head, and keeps Phases 10–13 locked until their prerequisites and evidence are complete. CI and physical-device acceptance remain separate proof levels.

### 16. Duplicate Trip form mutation and retired revenue metadata

**Finding:** Browser repository writes and the native-first Work service each contained their own Trip-detail mutation helper. Both also wrote the obsolete per-Trip `revenueAuthority: SUPPORTING_ONLY` marker, while native form commits removed it. New Trip creation still added that marker. This was unnecessary duplicated domain behavior and produced cross-runtime payload differences.

**Change:** Trip-detail application now lives in one domain function used by both browser repository and native-first Work paths. New Trip records no longer create the per-Trip revenue-authority marker; native commit cleanup and regression tests prevent its return. The single Shift revenue projection remains the semantic financial authority.

### 17. Cancellation fee / fare separation and Timeline integrity

**Finding:** The shared Trip lifecycle transition copied a cancellation fee into `Trip.revenue`, conflating two distinct source facts. Timeline also fell back from a missing cancellation fee to the Trip fare field, which could display an old fare as a cancellation fee. Timeline did not explicitly filter soft-deleted Trip rows.

**Change:** Cancellation transitions now update only `cancelledRevenue` and preserve any separate fare fact. Timeline displays only the saved cancellation fee and shows it unavailable when absent; it never falls back to Trip fare. Timeline now excludes soft-deleted Trips. Domain, Timeline and native acceptance tests cover the separation and shared revenue parity vector.

### 18. Shift normalization narrowed to current facts

**Finding:** The active Shift normalizer still mapped retired Personal KM, Dead KM, per-shift toll/parking, supplied distance and manual revenue aliases even though the current canonical Shift factory and end-shift path do not use those inputs.

**Change:** Shift normalization now accepts only opening/closing odometer and lifecycle timestamp aliases. Retired gap-allocation, manual revenue, per-shift toll/parking and supplied distance inputs are discarded from normalized new Shift input. Existing stored/backup records are not migrated or deleted by this change.

### 19. Native overlay lifecycle bypassed transition validation

**Finding:** Native overlay GO_TO_PICKUP, START_RIDE and END_RIDE assembled canonical Trip payloads and wrote them through generic `putRecord`. The UI stage normally constrained these actions, but the SQLite persistence boundary did not verify the prior canonical Trip stage or compare-and-set version. A stale native workflow snapshot could therefore attempt a stage regression or terminal Trip reopening.

**Change:** Added `commitTripLifecycle` as a dedicated native transaction boundary. It validates the active canonical Shift, expected prior Trip stage, target status/stage, stable Shift identity and expected Trip version inside the same SQLite transaction as the write. The overlay no longer uses generic record replacement for lifecycle transitions. Android instrumentation tests cover valid ordered transitions, idempotent retry, END before START, duplicate START, terminal reopening and Shift-ended rejection.

### 20. Cancellation was not guarded by the canonical pre-ride stage

**Finding:** The UI hid cancellation after ride start, but the shared domain transition and native SQLite form transaction relied primarily on status=ACTIVE. A stale or alternate caller could attempt to cancel a Trip after RIDE_STARTED.

**Change:** The domain transition now permits cancellation only at GOING_TO_PICKUP/PICKUP. Native SQLite independently enforces the same stage and refuses a form payload that changes the canonical stage. Regression and Android instrumentation tests verify that post-start cancellation is rejected while pre-ride cancellation and optional cancellation fees remain supported.

### 21. Native form transaction accepted unrelated Trip field changes

**Finding:** The native form transaction checked Shift identity and form status but wrote the entire submitted Trip payload. A stale or malformed fare/cancellation payload could therefore change lifecycle stage or unrelated Trip fields while saving a form.

**Change:** Native form commits now compare the submitted record with the canonical Trip after removing only fields owned by that form. Fare forms can update only fare/toll/parking/skipped-fare facts and update time. Cancellation forms can update only status, cancellation reason/fee, cancellation event time and update time. The old per-Trip revenue-authority marker is removed on form write. Android instrumentation verifies a fare form cannot change a completed Trip's lifecycle stage.

## Verification

The following are enforced by regression contracts:
- framework-independent Application layer and presentation-owned startup reactivity;
- one composition root and one JavaScript plugin registry;
- exact JS/native plugin registration parity;
- one native canonical write per fare/cancellation event using its durable event ID;
- one JavaScript domain revenue formula;
- no retired Work gap-allocation/reconciliation/trip-distance paths;
- native-first persistence ordering and browser-only PWA fallback;
- canonical record, backup/recovery, GPS, and UI isolation contracts.

CI is being rerun against the latest PR head. A passing emulator gate does not replace physical-device verification of the four GPS event moments, native overlay navigation, Android Back behavior, and Admin form/backup flows.
