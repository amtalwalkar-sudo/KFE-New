# KFE Business Rules — Audit & Defect Evidence

**Status:** SUPPORTING HISTORICAL / AUDIT EVIDENCE — NOT AN AUTHORITY

This document consolidates the former Phase 1 audit, Phase 3 re-audit, and business-rule defect ledger. Current business meaning is owned only by `KFE_BUSINESS_RULES_REGISTER.md`.

## Purpose

Preserve the business-rule discovery, defect disposition, re-audit evidence, and later audit candidates without maintaining three overlapping historical documents.

## Historical Phase 1 audit

The original audit used the chain:

1. Raw input/system-captured source
2. Input channel/form/field
3. Canonical storage
4. Calculation/formula
5. Derived value
6. UI/report display
7. PWA/Android convergence
8. Notification contract
9. Replay/duplicate protection
10. Reconciliation

The original BR-01 findings included Business Start Date, historical maintenance recovery, predictive maintenance rate, and pre-business loan recovery. These were subsequently re-audited and corrected. Historical findings must not be treated as current defects.

## Defect disposition

| ID | Historical finding | Current disposition |
|---|---|---|
| BRD-001 | No generic business-configuration entity | ACCEPTED / DISPOSITIONED |
| BRD-002 | Missing Business Start Date | VERIFIED — authoritative businessSetup field |
| BRD-003 | No generic opening-balance input | ACCEPTED / DISPOSITIONED |
| BRD-004 | No separate historical-maintenance input | ACCEPTED / DISPOSITIONED |
| BRD-005 | Acquisition date used as business boundary | VERIFIED — Business Start Date is authoritative |
| BRD-006 | No generic opening-balance entity | ACCEPTED / DISPOSITIONED |
| BRD-007 | Historical maintenance recovery missing | VERIFIED — ₹0.40/km over 12 recovery periods |
| BRD-008 | Predictive maintenance rate mismatch | VERIFIED — ₹1.60/km |
| BRD-009 | Pre-business loan recovery used surrogate boundary | VERIFIED — Business Start Date/origin-based recovery |

## Phase 3 re-audit evidence

Phase 3 confirmed BR-01 clean after the Phase 2 implementation. Evidence included:

- required Business Start Date persistence and IST date semantics;
- rejection of vehicle acquisition date as the business boundary;
- ₹0.40/km historical maintenance recovery over exactly 12 date-to-date periods;
- ₹1.60/km predictive maintenance rate;
- origin-based pre-business loan recovery over exactly 12 periods;
- boundary tests before, on, during, and after the Business Start Date.

This historical evidence does not replace the current business-rule register or calculation specification.

## Current audit candidates

These are retained only as audit/evidence history and must be verified against current code/contracts before being treated as current status.

| ID | Area | Current evidence/disposition |
|---|---|---|
| BRD-CAND-001 | Trip lifecycle | VERIFIED FIX — canonical transition path enforced |
| BRD-CAND-002 | Android END → fare interruption/replay | OPEN pending full interruption/replay evidence |
| BRD-CAND-003 | Android Golden Ride gate | OPEN until required gate exists and passes |
| BRD-CAND-004 | Cancellation semantics | VERIFIED |
| BRD-CAND-005 | Duplicate synthetic contract registration | RESOLVED |
| BRD-CAND-006 | Deployment evidence | Baseline verified; recheck after subsequent commits |
| BRD-CAND-007 | Native background GPS phase transition | Source/contract present; physical-device acceptance pending |
| BRD-CAND-008 | Android instrumentation result handling | VERIFIED for baseline |
| BRD-CAND-009 | Overlay revenue authority | VERIFIED FIX |
| BRD-CAND-010 | Overlay theme | Source/contract verified; physical-device visual acceptance pending |
| BRD-CAND-011 | Blank cancellation revenue | VERIFIED FIX |
| BRD-CAND-012 | Active-shift Driver Target achievement | OPEN — requires explicit business decision |
| BRD-CAND-013 | Background overlay GPS display | Source path present; physical-device acceptance pending |
| BRD-CAND-014 | Presentation modernization command | OPEN; separate from business logic |
| BRD-CAND-015 | Native overlay fare identity | Proposed fix requires CI/Golden Ride acceptance |
| BRD-CAND-016 | Native GPS stop race | Proposed fix requires CI/instrumentation acceptance |

## Governance findings retained from Phase 0

- Competing business-rule document was removed; rules were migrated to the register.
- Legacy roadmap references were corrected to the launch master plan.
- Historical release/visual documents were prevented from becoming active roadmap/authority sources.
- Duplicate contract registration was removed.
- Canonical implementation ownership was centralized.
- Phase 0 governance acceptance was separated from unrelated broad CI failures.

## Evidence rule

Tests and audit records prove or disprove current rules. They do not define business meaning. When historical evidence conflicts with current canonical documents, the canonical documents govern and the historical statement remains historical evidence.
