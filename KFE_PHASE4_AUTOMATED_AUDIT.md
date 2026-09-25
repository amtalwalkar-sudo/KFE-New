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


## Automated Evidence Pass 2 — 25 09 2026

**Build baseline:** main merge `528526c047ac5a68865c5d29045d7a59577214a1` + audit branch commit `0394c0bcb4e85e193e8870c0b0e6e04225e08e68`.

**Executed:**
- H6/H7 — executable Timeline/Performance/shift-authority reconciliation, including BR-11 INCLUDED and EXCLUDED treatment.
- I2/I6/I7 — executable multi-day odometer/revenue continuity and May/June month-boundary ownership.
- C6/F6/J7 — executable mutation creation, audit linkage, duplicate-safe terminal replay assumptions, and stale SYNCING→PENDING recovery simulation.
- D3/E4 — persistence/reload/restart wiring checks against canonical IndexedDB stores and cache/version-change recovery.
- D4 — canonical-only mutation queue and physical canonical/synthetic database isolation checks.

**Evidence result:** PASS for the automatable fixtures above. The financial fixture reconciled shift authority ₹2,200 to Financial Revenue ₹2,130 with ₹50 included toll + ₹20 included parking pass-through and ₹50 excluded toll expense; vehicle KM 200, business KM 170, dead KM 30, operating profit ₹2,080.

**Defects identified in this pass:** none.

**Important limitation:** persistence and reload checks are contract/simulation evidence in the Node CI environment; they do not replace a real browser IndexedDB reload, Android process-death, permission, GPS, overlay, or touch test. Those remain in the final physical-device gate.
