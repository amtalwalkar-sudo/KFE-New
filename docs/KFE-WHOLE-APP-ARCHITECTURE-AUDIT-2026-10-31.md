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

- Schema 18 removes legacy day, odometer-gap, movement-artifact, loan-payment, prepayment, settlement, driver-target, break-even-input, and financial-period stores from IndexedDB. Backup format 6 excludes them. Backup formats 1–5 are accepted only as migration inputs; their retired payloads are discarded while active in-scope records remain restorable.
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

No active finance engine, forecast, break-even, driver-target, provision, amortization or maintenance-projection calculation remains. The Loan form stores contractual source facts and displays only a derived monthly EMI estimate using the pure domain function; no EMI is persisted and no repayment schedule, payment history or balance ledger exists. Basic Performance remains limited to saved ride/cancellation and fuel facts.

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

### 17. Supporting UI and Android acceptance contracts contradicted current architecture

**Finding:** The authoritative UI shell contract still described a single shared command path, old odometer-gap/reconciliation/shift-review stages, target/progress context, and Auto/Light/Dark themes. The Android physical-device runbook still required continuous dead-movement traces, trace-distance checks and reconciliation. The end-to-end matrix and frozen overlay requirement also said native submissions depended on PWA command processing/acknowledgement before becoming business commits. These statements contradicted the current native-first Android transaction design and simplified product.

**Change:** The UI shell contract now documents distinct PWA and native command adapters over the same domain invariants and canonical record model, Dark Only, and the current Work lifecycle. The end-to-end matrix and frozen overlay requirement now describe atomic native SQLite commits followed by PWA synchronization/acknowledgement. The Android acceptance runbook was rewritten around four event-time GPS snapshots, offline operation, manual-only locality refresh, native commit/recovery, current Performance/Admin, and backup/reset acceptance. Retired movement-trace, ride-distance and reconciliation checks were removed. The UI shell regression contract now rejects the obsolete wording.

### 18. Release-phase status consistency

**Finding:** Launch status showed Phase 11 physical-device pilot as active while Phase 10 release-candidate freeze remained pending and Phase 5 cleanup was still in progress.

**Change:** Status now correctly identifies Phase 5 as active, requires fresh CI on the final cleanup head, and keeps Phases 10–13 locked until their prerequisites and evidence are complete. CI and physical-device acceptance remain separate proof levels.

### 19. Duplicate Trip form mutation and retired revenue metadata

**Finding:** Browser repository writes and the native-first Work service each contained their own Trip-detail mutation helper. Both also wrote the obsolete per-Trip `revenueAuthority: SUPPORTING_ONLY` marker, while native form commits removed it. New Trip creation still added that marker. This was unnecessary duplicated domain behavior and produced cross-runtime payload differences.

**Change:** Trip-detail application now lives in one domain function used by both browser repository and native-first Work paths. New Trip records no longer create the per-Trip revenue-authority marker; native commit cleanup and regression tests prevent its return. The single Shift revenue projection remains the semantic financial authority.

### 20. Cancellation fee / fare separation and Timeline integrity

**Finding:** The shared Trip lifecycle transition copied a cancellation fee into `Trip.revenue`, conflating two distinct source facts. Timeline also fell back from a missing cancellation fee to the Trip fare field, which could display an old fare as a cancellation fee. Timeline did not explicitly filter soft-deleted Trip rows.

**Change:** Cancellation transitions now update only `cancelledRevenue` and preserve any separate fare fact. Timeline displays only the saved cancellation fee and shows it unavailable when absent; it never falls back to Trip fare. Timeline now excludes soft-deleted Trips. Domain, Timeline and native acceptance tests cover the separation and shared revenue parity vector.

### 21. Shift normalization narrowed to current facts

**Finding:** The active Shift normalizer still mapped retired Personal KM, Dead KM, per-shift toll/parking, supplied distance and manual revenue aliases even though the current canonical Shift factory and end-shift path do not use those inputs.

**Change:** Shift normalization now accepts only opening/closing odometer and lifecycle timestamp aliases. Retired gap-allocation, manual revenue, per-shift toll/parking and supplied distance inputs are discarded from normalized new Shift input. Existing stored/backup records are not migrated or deleted by this change.

### 22. Native overlay lifecycle bypassed transition validation

**Finding:** Native overlay GO_TO_PICKUP, START_RIDE and END_RIDE assembled canonical Trip payloads and wrote them through generic `putRecord`. The UI stage normally constrained these actions, but the SQLite persistence boundary did not verify the prior canonical Trip stage or compare-and-set version. A stale native workflow snapshot could therefore attempt a stage regression or terminal Trip reopening.

**Change:** Added `commitTripLifecycle` as a dedicated native transaction boundary. It validates the active canonical Shift, expected prior Trip stage, target status/stage, stable Shift identity and expected Trip version inside the same SQLite transaction as the write. The overlay no longer uses generic record replacement for lifecycle transitions. Android instrumentation tests cover valid ordered transitions, idempotent retry, END before START, duplicate START, terminal reopening and Shift-ended rejection.

### 23. Cancellation was not guarded by the canonical pre-ride stage

**Finding:** The UI hid cancellation after ride start, but the shared domain transition and native SQLite form transaction relied primarily on status=ACTIVE. A stale or alternate caller could attempt to cancel a Trip after RIDE_STARTED.

**Change:** The domain transition now permits cancellation only at GOING_TO_PICKUP/PICKUP. Native SQLite independently enforces the same stage and refuses a form payload that changes the canonical stage. Regression and Android instrumentation tests verify that post-start cancellation is rejected while pre-ride cancellation and optional cancellation fees remain supported.

### 24. Native form transaction accepted unrelated Trip field changes

**Finding:** The native form transaction checked Shift identity and form status but wrote the entire submitted Trip payload. A stale or malformed fare/cancellation payload could therefore change lifecycle stage or unrelated Trip fields while saving a form.

**Change:** Native form commits now compare the submitted record with the canonical Trip after removing only fields owned by that form. Fare forms can update only fare/toll/parking/skipped-fare facts and update time. Cancellation forms can update only status, cancellation reason/fee, cancellation event time and update time. The old per-Trip revenue-authority marker is removed on form write. Android instrumentation verifies a fare form cannot change a completed Trip's lifecycle stage.

### 25. PWA-originated Android ride transitions bypassed the native lifecycle guard

**Finding:** The Android overlay used the dedicated SQLite lifecycle transaction, but PWA-originated START_RIDE, END_RIDE and CANCEL_RIDE still reached generic native `putRecord`. Domain validation and compare-and-set reduced risk, but the two Android entry points did not share one persistence-level transition boundary.

**Change:** Exposed `commitTripLifecycle` through the Capacitor plugin, infrastructure adapter and application boundary. PWA-originated Android ride transitions now use the same SQLite transaction as overlay transitions. The native store rejects lifecycle-field changes through generic Trip writes, preventing future callers from bypassing the guard. Regression coverage verifies PWA wiring, valid pre-ride cancellation, post-start cancellation rejection and generic-write bypass rejection.

### 26. Direct Performance launch could read a stale Android PWA projection

**Finding:** Timeline reads Trips through `ShiftTripRepository`, which triggers the canonical read boundary. Basic Performance instead read shifts and trips directly through `PerformanceRepository`. If Android overlay commits existed in native SQLite while IndexedDB was stale, opening Performance directly after restart could calculate from the older projection without first reconciling native records.

**Change:** Exposed `WorkService.ensureCanonicalReadModel()` as the application-owned reconciliation use case and made `PhaseOnePerformanceService` call it before reading the Performance snapshot. The shared read boundary also fails closed on Android if SQLite is unavailable, rather than serving stale IndexedDB data; browser-only PWA operation remains IndexedDB-authoritative. A regression contract verifies reconciliation precedes the snapshot read.

### 27. Locality eligibility and Timeline connectivity ownership were inconsistent

**Finding:** Timeline display rejected fixes with supplied accuracy above 75 metres, but the application locality-resolution eligibility path did not require recorded accuracy. It could send a missing/poor-accuracy fix to a provider. Timeline could also display a previously saved label for a snapshot with no accuracy metadata, and the presentation read `navigator.onLine` directly despite an existing platform connectivity port.

**Change:** Locality eligibility now requires valid coordinates and recorded accuracy from 0 through 75 metres before provider traffic. Timeline displays saved labels only for snapshots meeting that same accuracy gate; otherwise it shows coordinates offline or “Location unavailable” online. Connectivity state is read through `WorkRuntimePorts.platform.isOnline()`, and offline feedback is derived from the locality service result. Contracts cover missing accuracy, poor accuracy, invalid coordinates, and the presentation boundary.

### 28. Android backup could silently omit native-only Work and GPS records

**Finding:** Backup export treated an unavailable native canonical adapter as browser-only mode. On Android, this could produce a syntactically valid JSON backup containing stale IndexedDB Work projections but omitting the authoritative SQLite Shift, Trip and GPS snapshot records. Restore had the same risk when native storage could not be read.

**Change:** Native snapshot collection now distinguishes browser PWA from Android. Browser backup remains IndexedDB-only; Android backup/restore fails closed unless native SQLite is available and its paginated Work/GPS snapshot can be read completely. Regression coverage protects both platform branches.

### 29. PWA Trip creation and Shift lifecycle did not fully enforce native invariants

**Finding:** PWA-originated Android Start Trip used the generic create-intent record write, so it did not share the active-Shift transaction guard used by the overlay. PWA Start Shift also relied on application state to prevent a second active Shift, and Shift close checked active Trips before entering SQLite but did not repeat that invariant atomically at the persistence boundary.

**Change:** PWA Start Trip now commits its durable create intent through the same `GO_TO_PICKUP` lifecycle transaction as the overlay. Native SQLite rejects a second active Shift and rejects ACTIVE-to-COMPLETED Shift writes while any non-deleted Trip remains active. Instrumentation covers both invariants and verifies that a rejected close leaves the Shift active.

### 30. Native event read failure could masquerade as an empty queue

**Finding:** The native event plugin correctly rejected SQLite queue-read failures, but the JavaScript adapter caught those failures and returned an empty array. Work startup could therefore proceed without replaying a pending native ride action. The view also had no recovery gate to prevent a new PWA mutation while that queue remained unread.

**Change:** The adapter now propagates SQLite and legacy-slot read failures. The application controller owns FIFO replay and the pre-ledger compatibility fallback; it stops at the first unconfirmed event. The Work view disables mutating controls until recovery completes, retries only on startup/foreground/native-action triggers, and does not synchronize stale PWA state into the overlay while recovery is blocked.

### 31. Backup and database schema still retained retired workflow stores

**Finding:** The active app no longer used `days`, `odoGaps`, `movement_artifacts`, `loan_payments`, `prepayments`, `settlements`, `driver_targets`, `break_even_inputs` or `financial_period_snapshots`, but IndexedDB still created them and BackupService exported them. The canonical data contract and Admin audit therefore described obsolete backup compatibility as an active retention requirement.

**Change:** Bumped IndexedDB to schema 18 and backup format to 6. The upgrade drops the retired object stores and the old Trip `dayId` index. New phone, Dropbox and internal recovery backups contain only current Work, Fuel, GPS, Admin source records and recovery/audit stores. Backup formats 1–5 remain structurally validated; their retired payloads are discarded before restore, while current in-scope records are retained. Added migration contracts for v1–v5.

### 32. Generic native record API still exposed a Trip creation bypass

**Finding:** Existing native storage prevented generic updates from changing Trip lifecycle fields, but a generic `putRecord` create could still insert a new Trip without the guarded GO_TO_PICKUP transaction. Backup restore also used that generic API, making it unsafe to close the bypass without a separate restore boundary.

**Change:** Generic native Trip writes now fail at the store, plugin adapter and shared application boundary. Normal Trip writes must use lifecycle/form transactions. Backup restore uses an explicit insert-only command that permits only Shift, Trip and GPS snapshot records, requires the Trip's parent Shift to exist, and rejects overwrites. Backup merge now calls that restore boundary. Android instrumentation tests cover generic create/update rejection and restore fixture behavior.

### 33. The active Loan EMI estimate was missing from the simplified Admin surface

**Finding:** The Loan form retained principal, tenure and annual interest rate as source facts, but the simplified Admin surface no longer displayed the one derived monthly EMI estimate that belongs in the current scope. Restoring the old loan engine would be excessive and would reintroduce retired repayment workflows.

**Change:** Added one pure domain function for the fixed-rate monthly EMI formula and a thin Admin application service. The Loan list displays the derived estimate beside the saved terms. EMI is never persisted. No amortization schedule, payment history, remaining balance, prepayment, payment allocation or ledger was restored. A deterministic contract covers zero-interest, positive-interest, invalid-input and rounding cases; the suite runner explicitly includes it.

### 34. Work presentation still invoked the domain revenue formula directly

**Finding:** The Work view imported the domain revenue function through a thin application re-export and performed Shift filtering in the component. The formula itself was not duplicated, but the presentation layer still selected the business inputs and called the domain rule directly.

**Change:** Converted the re-export into a real application-owned `LiveRevenueReadModel` with `forShift` and `forTrips` entry points. WorkModuleView now consumes that read model for the live Shift total and end-shift preview. The pure domain formula remains the single JavaScript calculation authority; repository and native transaction mirrors continue to use the same rule for atomic persistence.

### 35. Architecture and test contracts were stale after the guarded lifecycle/restore split

**Finding:** Several contracts still expected generic native `putRecord` for backup restore, omitted the new `restoreRecord` and `commitTripLifecycle` runtime ports, or matched obsolete timestamp and matrix wording. One persistence contract also contained a malformed regular expression. These stale assertions obscured the actual boundary rather than testing it.

**Change:** Updated the contracts to assert the dedicated insert-only restore command, the guarded lifecycle port, the current timestamp path and the current Golden Ride matrix wording. The Android recovery fixture now uses canonical Trip revenue facts rather than the retired `fare` field. The lifecycle storage guard test now exercises a permitted generic Shift write so it reaches the Android fail-closed guard instead of being rejected earlier by the intentional generic-Trip prohibition.

### 36. Canonical Trip records still carried obsolete embedded GPS placeholders

**Finding:** New Trip records still created `tripStartLocation`, `tripEndLocation` and embedded locality-status fields. Browser and native persistence also retained helpers that copied those old fields across Trip updates, even though the active capture path writes separate `GPS_SNAPSHOT` records and Timeline reads only those snapshots.

**Change:** Removed the embedded fields from the canonical Trip factory, strip them during Trip normalization, and removed the browser/native metadata-preservation helpers. The only active GPS authority is the separate canonical event snapshot store; the four event moments do not mutate Trip or Shift records. Legacy embedded fields are ignored only when comparing old operation-ledger payloads for idempotent replay; they are never copied into a new write. The redundant application-layer GPS normalizer re-export was also removed so the pure fix validator has one domain owner.

### 37. Runtime and boundary test fixtures still referenced retired stores and workflows

**Finding:** The runtime visual smoke fixture still opened retired `loans` and `loan_payments` stores and seeded obsolete embedded Trip GPS and distance fields. An unreferenced Phase 4 boundary-continuity script also imported retired gap-allocation and operational-record workflows. The event-GPS-only contract still pointed to the removed application-layer normalizer alias.

**Change:** The runtime fixture now seeds only active Shift, Trip, Fuel and GPS snapshot stores, verifies separate GPS evidence and uses no retired calculation fields. Deleted the unreferenced Phase 4 continuity script and updated the GPS contract to target the single domain fix validator.

### 38. PWA domain completion was less strict than the native lifecycle transaction

**Finding:** The native SQLite lifecycle command rejected END_RIDE unless the canonical Trip was already at RIDE_STARTED. The shared JavaScript `transitionTrip` checked only ACTIVE status, so browser-PWA completion could bypass the same stage invariant.

**Change:** The shared domain transition now rejects completion before RIDE_STARTED. PWA domain tests cover END_RIDE-before-START_RIDE rejection, and existing valid Golden Ride fixtures advance through the shared stage transition first. Both runtimes now enforce the same ordered lifecycle.

### 39. Timeline reads performed an unnecessary connectivity check

**Finding:** Opening or refreshing the read-only Timeline called the platform connectivity port solely to decide whether unresolved coordinates should be displayed. That made ordinary Timeline reads perform a connectivity check despite locality resolution being manual-only.

**Change:** Removed connectivity detection from the Timeline read model. A saved verified locality is shown when available; otherwise valid stored coordinates remain visible without a network-state check. Invalid coordinates and supplied accuracy worse than 75 metres remain unavailable. Only the explicit pull-to-refresh locality service checks connectivity and contacts providers.

### 40. Native canonical Work reads could silently truncate at 1,000 records

**Finding:** Work reconciliation and post-write refresh read only one fixed 1,000-record page, while GPS history and backup had separate pagination implementations. A long-lived canonical history could therefore be partially projected into IndexedDB, and the same pagination responsibility had multiple owners.

**Change:** Added one application-boundary `CanonicalWorkBoundary.listAllRecords` implementation with validated page offsets, stable total counts, unique record IDs and complete row counts. Work reconciliation, post-write refresh, GPS history and backup now reuse it. Incomplete, changing or duplicate pages fail closed; a fixed first page is never treated as the full history.

### 41. Soft-deleted Work rows could influence active-state decisions

**Finding:** Several repository lifecycle checks selected ACTIVE Shift/Trip rows without excluding soft-deleted records. The Android end-shift guard also considered a deleted active Trip.

**Change:** Added one repository live-record predicate and applied it to active Shift/Trip creation, stage/form transitions, shift completion, active-state reads and last-record lookups. Active Trip reads are now scoped to the selected live active Shift, and Android Shift closure ignores deleted Trip rows.

### 42. Manual locality refresh was limited by the selected Timeline period

**Finding:** The pull-to-refresh handler collected snapshots only for rides visible in the current Timeline period. With Today as the default, this meant eligible unresolved events from earlier days in the seven-day window were not considered, despite the UI promising a seven-day refresh.

**Change:** Added `EventLocationService.allSnapshots` to combine complete native paginated GPS history with browser-local snapshots. Explicit Timeline pull-to-refresh now submits all four event types to the seven-day eligibility rule, independently of the selected display period. Ordinary Timeline reads still do not perform locality resolution or connectivity checks.

### 43. Blank numeric form inputs could be coerced into valid zero values

**Finding:** A blank fuel odometer was converted by `Number('')` to zero, and a blank/missing loan interest rate could be interpreted as an explicit 0% rate. Both cases could produce misleading saved facts or derived EMI.

**Change:** Fuel entry now distinguishes an explicitly entered zero odometer from a blank value. Loan EMI requires a supplied interest rate; explicit 0% remains valid. Regression contracts cover both cases.

### 44. The fuel domain summary trusted callers to remove soft-deleted rows

**Finding:** Performance and Timeline services already filtered deleted fuel rows, but the shared fuel calculation itself did not. A future caller could include deleted refills in total spending or full-tank intervals.

**Change:** The fuel domain summary now excludes soft-deleted records at its own boundary, including both spending and interval derivation. Tests prove deleted full-tank entries contribute to neither metric.

### 45. Master specification index and runtime architecture summary were imprecise

**Finding:** The master specification had a numbering gap in its authority index and described a single generic local database, which obscured the browser IndexedDB versus Android SQLite durability split.

**Change:** Corrected the authority index and made the product architecture summary explicit: browser-only PWA uses IndexedDB; Android Work/GPS durability and overlay commands use Capacitor/native SQLite; the PWA synchronizes the native canonical projection through configured runtime ports.

## Verification

The following are enforced by regression contracts:
- framework-independent Application layer and presentation-owned startup reactivity;
- one composition root and one JavaScript plugin registry;
- exact JS/native plugin registration parity;
- one native canonical write per fare/cancellation event using its durable event ID;
- one JavaScript domain revenue formula;
- no retired Work gap-allocation/reconciliation/trip-distance paths;
- native-first persistence ordering and browser-only PWA fallback;
- canonical record, backup/recovery, GPS, and UI isolation contracts;
- the minimal Loan EMI formula and application/UI boundary;
- native lifecycle transition, active-Shift, pre-ride cancellation and insert-only restore guards.

CI is being rerun against the latest PR head. A passing emulator gate does not replace physical-device verification of the four GPS event moments, native overlay navigation, Android Back behavior, and Admin form/backup flows.
