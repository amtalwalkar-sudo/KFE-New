# KFE Phase 4 — Real-World Operational Audit

**Status:** ACTIVE — AUDIT IN PROGRESS  
**Phase:** 4 — Real-World Operational Audit  
**Baseline commit:** 234a5d61b0704cf784ef75dd6e2ce179a5c71f2c  
**Audit rule:** CI/build success is supporting evidence only. This document does not declare production readiness.

## Objective

Verify that KFE works as an actual driver-facing system under realistic operation, including mistakes, interruptions, foreground/background transitions, permissions, GPS conditions, financial reconciliation, and multi-day continuity.

The audit is scenario-driven. A scenario is **PASS** only when its required real-world evidence is captured and the resulting records reconcile through the canonical application path.

## Evidence rules

For every scenario record:

- exact test date in **DD MM YYYY**;
- exact test time in **HH MM SS**;
- device / Android version where applicable;
- build commit SHA and APK identity where applicable;
- starting state;
- actions performed;
- expected result;
- observed result;
- persisted-record result;
- cross-surface result;
- PASS / FAIL / BLOCKED;
- defect ID when failed.

Do not convert a CI result into a real-device PASS.

## Scenario matrix

### A — Normal working day

| ID | Scenario | Required evidence | Status |
|---|---|---|---|
| A1 | Start shift with valid odometer | Start gate, shift record, target state | NOT EXECUTED |
| A2 | Passenger ride start → completion → fare | Trip lifecycle, fare, revenue, Timeline | NOT EXECUTED |
| A3 | Multiple rides in one shift | Ordered rides and cumulative totals | NOT EXECUTED |
| A4 | End shift with closing odometer/revenue | Shift close and financial totals | NOT EXECUTED |
| A5 | CNG refuel while offline | Refuel record, amount/quantity calculation, timestamp/GPS when available | NOT EXECUTED |

### B — Human mistakes

| ID | Scenario | Required evidence | Status |
|---|---|---|---|
| B1 | Invalid / missing start odometer | Action blocked with clear recovery path | NOT EXECUTED |
| B2 | Start/end odometer gap classification | Personal KM / Dead KM choice and persisted result | NOT EXECUTED |
| B3 | Accidental Offline while ride active | Safe prevention/recovery; no premature shift close | NOT EXECUTED |
| B4 | Back/cancel from start or end form | State returns without unintended write | NOT EXECUTED |
| B5 | Cancelled ride | Cancellation persisted once and excluded from revenue | NOT EXECUTED |
| B6 | Duplicate tap / repeated action | Idempotent result; no duplicate trip/revenue | NOT EXECUTED |

### C — Overlay-heavy operation

| ID | Scenario | Required evidence | Status |
|---|---|---|---|
| C1 | Overlay pickup / active ride state | Correct active-trip identity | NOT EXECUTED |
| C2 | Overlay END RIDE | Same canonical trip completion path as main app | NOT EXECUTED |
| C3 | Overlay fare entry | Fare persisted to canonical trip exactly once | NOT EXECUTED |
| C4 | Overlay process/background transition | Pending action recovery without replay | NOT EXECUTED |
| C5 | Overlay bubble/minimize/reopen | State continuity and no duplicate action | NOT EXECUTED |

### D — PWA-heavy operation

| ID | Scenario | Required evidence | Status |
|---|---|---|---|
| D1 | PWA open/reload during shift | Shift/trip state restored | NOT EXECUTED |
| D2 | PWA offline operation | Local persistence and later continuity | NOT EXECUTED |
| D3 | Timeline after operational writes | Records visible and ordered correctly | NOT EXECUTED |
| D4 | Performance after operational writes | Calculations consume canonical records | NOT EXECUTED |
| D5 | Admin edits followed by Work use | Updated master data used consistently | NOT EXECUTED |

### E — Mixed PWA ↔ overlay operation

| ID | Scenario | Required evidence | Status |
|---|---|---|---|
| E1 | Start in PWA, complete in overlay | One canonical trip and one fare | NOT EXECUTED |
| E2 | Start in overlay, continue in PWA | Same active trip identity | NOT EXECUTED |
| E3 | Switch surfaces repeatedly | No duplicate lifecycle transition | NOT EXECUTED |
| E4 | Complete ride, immediately inspect Timeline/Performance | Cross-surface consistency | NOT EXECUTED |

### F — Interruption / recovery

| ID | Scenario | Required evidence | Status |
|---|---|---|---|
| F1 | App backgrounded during active ride | State survives | NOT EXECUTED |
| F2 | App force-stopped during active ride | Recovery behavior documented and safe | NOT EXECUTED |
| F3 | Phone screen locked/unlocked | Active state preserved | NOT EXECUTED |
| F4 | Process restart after pending action | Pending action consumed once | NOT EXECUTED |
| F5 | Network loss/recovery | Local operation remains coherent | NOT EXECUTED |

### G — GPS / permissions

| ID | Scenario | Required evidence | Status |
|---|---|---|---|
| G1 | GPS available | Coordinates/timestamps captured where required | NOT EXECUTED |
| G2 | GPS denied | User can continue where rules permit; no crash | NOT EXECUTED |
| G3 | GPS unavailable | Explicit degraded state; no fabricated location | NOT EXECUTED |
| G4 | Permission restored | GPS state recovers without duplicate records | NOT EXECUTED |
| G5 | Driver-facing location events | Place-name display where available; raw coordinates remain data, not primary UI | NOT EXECUTED |

### H — Financial reconciliation

| ID | Scenario | Required evidence | Status |
|---|---|---|---|
| H1 | Ride fares vs shift revenue | Exact reconciliation | NOT EXECUTED |
| H2 | Shift totals vs daily totals | Exact reconciliation | NOT EXECUTED |
| H3 | Fuel/refuel financial record | Amount, quantity, price consistency | NOT EXECUTED |
| H4 | Maintenance / loan / target outputs | Canonical calculations and no double-counting | NOT EXECUTED |
| H5 | Timeline vs Performance | Same underlying operational records | NOT EXECUTED |

### I — Multi-day continuity

| ID | Scenario | Required evidence | Status |
|---|---|---|---|
| I1 | Close one day → open next day | Correct day boundaries | NOT EXECUTED |
| I2 | Carry vehicle odometer across days | Monotonic and reconciled | NOT EXECUTED |
| I3 | Carry financial totals across days | No leakage between days | NOT EXECUTED |
| I4 | Historical records after reload | Stable persistence and ordering | NOT EXECUTED |
| I5 | Business Start Date boundary across days | Business-day classification remains correct | NOT EXECUTED |

### J — Boundary conditions

| ID | Scenario | Required evidence | Status |
|---|---|---|---|
| J1 | Zero-value fare / expense where permitted | Correct treatment | NOT EXECUTED |
| J2 | Same odometer start/end | Rule-consistent handling | NOT EXECUTED |
| J3 | Large but valid odometer gap | Correct classification and persistence | NOT EXECUTED |
| J4 | Midnight / date rollover | Correct date and time display | NOT EXECUTED |
| J5 | Business Start Date boundary | Before/on/after behavior | NOT EXECUTED |
| J6 | Missing optional GPS | No invented coordinates/place | NOT EXECUTED |
| J7 | Repeated reload / reopen | No duplicate records | NOT EXECUTED |

## Automated supporting evidence — non-device completion checkpoint

The consolidated Phase 4 automated matrix has now been exercised successfully for the non-device scenarios implemented in CI, including A5, D2, D5, F1, F5, G2, G3, G4, H4 and I5/J5 boundary coverage. These results are **supporting evidence only**; they are not real-device PASS records.

### Device-only scenarios intentionally deferred

The following remain **DEFERRED — FINAL PHASE 4 DEVICE AUDIT** and must be executed on the physical Android device before Phase 4 can close:

- C1–C5 — overlay-heavy operation
- E1–E2 — PWA ↔ overlay operation
- F2–F3 — force-stop and screen-lock/unlock recovery

No simulated CI result may be converted into PASS for these scenarios.

### Non-device checkpoint disposition

**Disposition: COMPLETE FOR AUTOMATED SUPPORTING EVIDENCE; PHASE 4 REMAINS ACTIVE.**

The automated non-device work is complete for the current audit checkpoint. The remaining Phase 4 exit evidence is the physical-device audit above, plus any defects discovered there.

## Automated supporting evidence already present

The current main CI includes the Phase 4 runtime visual verification. It exercises shell/routes, Work interactions, GPS control behavior, themes, accessibility, responsive layout, and canonical/synthetic IndexedDB startup isolation.

This automated coverage is **supporting evidence only** and does not replace the real-device scenarios above.

## Defect handling

Any failed scenario becomes a Phase 4 operational defect with:

1. scenario ID;
2. reproducible steps;
3. expected vs observed behavior;
4. affected surface/device;
5. evidence;
6. severity;
7. canonical data impact;
8. whether the defect is isolated or cross-surface.

Phase 5 remains locked until the Phase 4 audit produces its consolidated defect set.

## Exit rule

Phase 4 can close only after all applicable scenarios have been executed or explicitly dispositioned, evidence is recorded, defects are consolidated, and the Phase 4 exit decision is documented.

**No production-readiness claim is made by this audit record.**
