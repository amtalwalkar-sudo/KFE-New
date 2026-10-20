# KFE Headless Fare POC

Status: **Stage 1 domain spike only. Not production-wired.**

## Goal

Run the existing fare-validation and revenue-projection rules in a headless JavaScript runtime without duplicating them in Kotlin, and commit the result to the existing canonical Android SQLite repository while the WebView is unavailable.

## Existing code map

| Concern | Existing source | Boundary |
| --- | --- | --- |
| Fare validation | `src/domain/work/trip.js` — `validateTripCorrection` | Pure domain function |
| Trip lifecycle | `src/domain/work/tripLifecycle.js` — `transitionTrip`, `transitionTripStage` | Pure domain functions |
| Shift revenue projection | `src/domain/work/liveRevenue.js` — `deriveLiveRevenue` | Pure domain function |
| Financial reconciliation | `src/domain/work/revenueReconciliation.js` | Domain calculations |
| Shift-end validation | `src/domain/work/endShift.js` — `validateEndShiftEntry` | Domain validation; delegates to the shared shift-start rule interpreter |
| Shift-end orchestration | `src/application/work/endShift.js` — `completeEndShift` | Repository-dependent application service |
| Browser canonical persistence | `src/repositories/shiftTripRepository.js` | IndexedDB transactions, audit and projection |
| Android canonical persistence | `android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java` | SQLite transaction, operation ledger and audit |
| Native persistence bridge | `android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkPlugin.java`; `src/infrastructure/android/nativeCanonicalWork.js` | Current Capacitor WebView bridge |
| PWA-to-native mirroring | `src/application/work/workService.js` — `mirrorCanonicalRecord` | Persists locally and then mirrors to native canonical storage |

## Stage 1 implemented

`src/application/work/headlessFareCommand.poc.js` composes the existing pure TypeScript-compatible JavaScript rules (`validateTripCorrection` and `deriveLiveRevenue`) into an isolated `FARE_SUBMITTED` evaluator. The contract test covers a ₹450 fare, skipped fare detail as ₹0, negative fare rejection, active-trip rejection and input immutability.

This evaluator is not wired into production and does not claim to persist data.

## Blocking integration fact

The existing Android canonical store is exposed through `KfeCanonicalWorkPlugin`, a Capacitor plugin called through the WebView bridge. A headless runner cannot simply assume it can invoke this plugin or use browser IndexedDB. The project currently has no `@capacitor/background-runner` dependency in `package.json`, and the native overlay currently performs canonical writes in Java.

Therefore Stage 1 does **not** prove the requested WebView-unavailable SQLite flow. Before integrating the POC, a native-triggerable headless execution adapter must be demonstrated that:

1. invokes the bundled shared domain function on demand from an overlay action while the WebView is unavailable;
2. reads and commits to the existing `kfe_canonical_work.db` store (not a new database and not IndexedDB);
3. atomically commits the trip update, derived `Shift.revenue`, operation outcome and audit record with the existing idempotency/version guards;
4. returns a durable accepted/rejected outcome to the overlay;
5. survives retry and process death without duplicating or losing the operation.

Background Runner is a candidate for the JavaScript execution environment, not yet a proven solution for this on-demand overlay-to-SQLite path. Its official docs describe short-lived event handlers and a limited headless API; they do not establish that this app's custom `KfeCanonicalWork` plugin is directly available in the runner.

## Safety constraints

- Do not replace or bypass the current durable native outbox/checkpoint recovery.
- Do not treat a queued event as a committed fare.
- Do not introduce another SQLite database.
- Keep the established financial authority: eligible completed-trip fares plus cancellation fees; blank/not-applicable cancellation fees and skipped fare details contribute ₹0.
- Do not merge or deploy this spike as production behavior until the Android instrumentation test runs with the WebView unavailable and verifies canonical SQLite contents after reopening the PWA.
