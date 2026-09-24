# KFE Business Rules Audit

**Phase:** 1 — Business Rules Audit  
**Status:** ACTIVE  
**Current batch:** BR-01 — Business foundation  
**Audit method:** Discover → group → execute → collect gaps → record defects → fix in Phase 2 → re-audit in Phase 3

## Objective

Prove that every business rule defined in KFE_BUSINESS_RULES_REGISTER.md is correctly implemented end-to-end. No other document may define a competing business rule.

## Required evidence chain

For every applicable rule:

1. Raw input or system-captured source exists.
2. Input channel/form/field exists where human input is required.
3. Canonical storage exists.
4. Calculation/formula is correct.
5. Derived value is correct.
6. UI/report display is correct.
7. PWA and Android overlay converge on the same canonical outcome.
8. Notifications obey the canonical event contract.
9. Replays do not create duplicate records or financial outcomes.
10. Relevant reconciliation passes.

## Test batches

| Batch | Scope | Status |
|---|---|---|
| BR-01 | Business foundation | **ACTIVE — audit in progress** |
| BR-02 | Master data | PENDING |
| BR-03 | Business calendar | PENDING |
| BR-04 | Driver / shift | PENDING |
| BR-05 | Trip lifecycle | PENDING |
| BR-06 | Operating expenses | PENDING |
| BR-07 | Finance | PENDING |
| BR-08 | Targets / economics | PENDING |
| BR-09 | Reporting / reconciliation | PENDING |
| BR-10 | Overlay / notifications contracts | PENDING |

## BR-01 repository conformance findings

The deterministic source-definition runner completed successfully. This only proves the audit runner completed.

### Business Start Date
**CONFIRMED DEFECT.** No authoritative Admin `businessStartDate` field exists. `financePerformanceAdapter.js` instead derives the boundary from earliest live vehicle `acquiredOn`.

### Opening vehicle state
**CONFORMS.** Vehicle Admin input contains required `openingOdometerKm`. The frozen rule intentionally derives historical maintenance burden from it; no manual historical-maintenance amount field is required.

### Historical maintenance / repairs
**CONFIRMED DEFECT.** The canonical path has current/predictive maintenance provision logic, but no implementation of:
- opening business-day odometer × **₹0.40/km**;
- **12-month** recovery;
- Business Start Date start boundary;
- date-to-date/mid-month-to-mid-month recovery periods.

This is a derived calculation/recovery defect, **not a missing manual input field**.

### Predictive maintenance
**PARTIAL / DEFECT.** The canonical performance engine calculates KM × configured maintenance provision rate, but the Admin form defaults `maintenanceProvisionPerKm` to **₹2/km**, while frozen BR-01 requires **₹1.60/km**.

### Pre-business loan obligation
**PARTIAL / INCORRECT.** The canonical loan engine exists, but `calculatePreBusinessRecovery` currently uses the surrogate vehicle-acquisition boundary, considers only overdue EMI rows before that boundary, then divides by 12. Frozen BR-01 requires origin-based classification against the authoritative Business Start Date and 12-month recovery from that date.

### Opening balances
**NOT A DEFECT AS PREVIOUSLY WORDED.** BR-01 explicitly requires use of authoritative underlying Admin facts/records and forbids a parallel generic opening-balance source. Absence of a generic `openingBalance` entity is therefore not a defect.

### Pre-business cost scope
**PARTIAL.** Supported authoritative categories are historical maintenance/repairs and loan balance/unpaid EMI. The loan path exists; historical-maintenance recovery does not. No generic setup-cost input should be invented.

## Original provisional defect disposition

| ID | Final disposition |
|---|---|
| BRD-001 | **DISPOSITIONED** — no generic business-configuration entity is independently required; authoritative inputs are defined by concept |
| BRD-002 | **CONFIRMED — OPEN** — missing authoritative Business Start Date input |
| BRD-003 | **DISPOSITIONED — NOT A DEFECT** — no generic opening-balance source is required |
| BRD-004 | **DISPOSITIONED — NOT A DEFECT** — no separate historical-maintenance amount input is permitted/required |
| BRD-005 | **CONFIRMED — OPEN** — vehicle acquisition is incorrectly used as business-start boundary |
| BRD-006 | **DISPOSITIONED — NOT A DEFECT** — frozen underlying-record rule governs opening values |
| BRD-007 | **CONFIRMED — OPEN** — narrowed to missing historical-maintenance recovery; unsupported setup categories remain out of scope |

## Additional confirmed defect

**BRD-008 — Predictive maintenance rate mismatch.** Admin maintenance-rate default is ₹2/km; frozen authoritative predictive rate is ₹1.60/km.

## Additional confirmed defect

**BRD-009 — Pre-business loan recovery implementation mismatch.** The loan recovery function does not implement the frozen origin-based Business Start Date rule.

## Audit rule

No implementation/UI fixes are made while BR-01 conformance classification is being established. Phase 2 receives the frozen defect set after audit completion.

## Current state

**BR-01 repository conformance classification is complete for the inspected foundation paths.**

Confirmed defects:
- BRD-002 / BRD-005 — Business Start Date source and surrogate usage.
- BRD-007 — historical maintenance recovery missing.
- BRD-008 — predictive maintenance rate mismatch.
- BRD-009 — pre-business loan recovery mismatch.

**BR-01 is NOT CLEAN. Phase 2 remains locked.**

Business-rule correctness and real-world operational correctness remain separate; Phase 4 handles real-world operational audit.