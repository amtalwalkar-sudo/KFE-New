# KFE PWA + Capacitor Whole-Application Architecture Audit

**Date:** 2026-10-31  
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
