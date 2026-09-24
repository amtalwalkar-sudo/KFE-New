# KFE Phase 4 — Automated Operational Audit Evidence

**Status:** AUTOMATED COVERAGE EXECUTED — DEVICE GATE DEFERRED  
**Phase:** 4 — Real-World Operational Audit  
**Scope:** Tests that can be executed without a physical Android device  
**Evidence rule:** Automated PASS is not a physical-device PASS.

## Execution

The automated audit is registered in `src/tests/runAllContracts.js` as `phase4AutomatedOperationalAudit.contract.js`.

The test emits an exact India-time execution stamp in **DD MM YYYY / HH MM SS** format for each scenario and records a final `DEFERRED_DEVICE_GATE` list in CI output.

## Automated scenarios covered

| Area | Scenarios exercised automatically |
|---|---|
| A Normal day | A1 valid shift start, A2 trip completion/fare, A3 multiple trips, A4 shift end, A5 fuel entry |
| B Human mistakes | B1 invalid start odometer, B2 Personal/Dead KM gate, B3 end-shift gate behavior, B4 invalid close/recovery, B5 cancellation, duplicate terminal replay |
| C Overlay | Canonical lifecycle/state convergence and overlay command-path wiring |
| D PWA | canonical persistence wiring, reload/recovery architecture, Timeline/Work continuity contracts |
| E Mixed surfaces | shared canonical trip identity and lifecycle path |
| F Recovery | mutation queue/persistence wiring plus safe GPS handler recovery; physical process-death behavior deferred |
| G GPS | simulated/degraded GPS state contracts, null/unavailable handling, handler resilience; hardware/permission prompts deferred |
| H Finance | shift revenue authority, trip-detail reconciliation, BR-11 INCLUDED/EXCLUDED treatment |
| I Multi-day | odometer carry, IST day ownership, historical/persistence boundaries |
| J Boundary | zero values, negative/invalid inputs, large-distance confirmation, midnight boundary, missing GPS, repeated terminal action |\n| K Driver UX / surface integrity | Work start/end gates, active-trip Offline block, Back/cancel recovery, compact fuel-form toggle/draft, place-name preference, GPS shell indicator, retired shell labels absent, native overlay canonical action wiring |

## Explicitly not marked PASS here

The following remain reserved for the final physical-device gate:

- real Android GPS hardware and permission prompts;
- real background/process death and native resume;
- lock/unlock behavior;
- real overlay bubble/minimize/reopen behavior;
- physical touch/gesture behavior;
- device-specific rendering/performance.

These items must be executed on the target Android device before Phase 4 can close.

## Exit impact

This evidence closes the **automatable-test portion** of Phase 4 only. It does **not** close Phase 4 and does not unlock Phase 5.

Phase 4 remains ACTIVE until the device-only gate and any resulting defect/re-audit cycle are completed.
