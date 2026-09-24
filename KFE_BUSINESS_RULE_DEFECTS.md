# KFE Business Rule Defects

**Phase:** 1–3 Business Rules

This is the consolidated defect ledger for business-rule audit findings.

## Defect policy

- A defect must reference one or more rule IDs.
- Findings are recorded before fixes where practical.
- Fixes are made in Phase 2.
- Phase 3 re-audits the affected rule(s) and regression set.
- A defect is not closed merely because code changed; verification evidence is required.

## Status values

- OPEN
- IN PROGRESS
- FIXED — AWAITING RE-AUDIT
- VERIFIED
- ACCEPTED / DISPOSITIONED

## Confirmed Phase 1 Batch 1 findings

| ID | Rule area | Confirmed finding | Status |
|---|---|---|---|
| BRD-001 | BR-01 Business configuration | No authoritative Admin business-configuration source form is defined in `ADMIN_FORM_DEFINITIONS`. | OPEN |
| BRD-002 | BR-01 Business start boundary | No authoritative `businessStartDate` input exists in the Admin source-record definitions. | OPEN |
| BRD-003 | BR-01 Opening balances | No authoritative opening-balance input exists in the Admin source-record definitions. | OPEN |
| BRD-004 | BR-01 Pre-business expenses | No dedicated authoritative historical/pre-business expense source form exists in the Admin form definitions; historical integrity/recovery logic is not itself a human input channel. | OPEN |

### Confirmed downstream evidence findings

| ID | Rule area | Downstream finding | Status |
|---|---|---|---|
| BRD-005 | BR-01 Business start boundary | financePerformanceAdapter.js derives the business-start boundary from the earliest vehicle acquiredOn date because no authoritative businessStartDate exists; that surrogate is fed into pre-business loan recovery. | OPEN |
| BRD-006 | BR-01 Opening balances | No authoritative opening-balance entity/field exists in canonical storage or the audited finance/performance calculation chain, so opening financial position cannot be calculated or reconciled from a source fact. | OPEN |
| BRD-007 | BR-01 Pre-business expenses | The canonical pre-business recovery calculation covers loan overdue burden, but no equivalent authoritative recovery/input path exists for accepted historical maintenance/setup/pre-activation expense categories. | OPEN |

### Evidence boundary

These are **source-definition defects confirmed by the deterministic Batch 1 audit**. They do not yet prove every downstream storage/calculation/display consequence is broken. That downstream evidence remains part of BR-01 before the batch can close.

The following existing source definitions were detected and therefore are not currently source-definition gaps:

- Vehicle: including opening odometer.
- Driver.
- Driver target.
- Loan.
- Maintenance.
- Compliance.

## Current known audit candidates

These are pre-audit leads retained for later validation.

| ID | Rule area | Candidate finding | Status |
|---|---|---|---|
| BRD-CAND-001 | Trip lifecycle | Repository `setTripStage(id, stage)` may accept arbitrary stage values without enforcing the canonical transition graph | OPEN — candidate |
| BRD-CAND-002 | Android overlay | END → fare uses a pending-action path that may lose the END command if process interruption occurs between completion and fare entry | OPEN — candidate |
| BRD-CAND-003 | Android release gate | Current Android CI smoke gate may not exercise the full Golden Ride Gate required for release verification | OPEN — candidate / gate evidence |
| BRD-CAND-004 | Release documentation | Android release-gate wording may contain stale cancellation semantics relative to the canonical rule that cancellation is available only during pickup | OPEN — candidate |
| BRD-CAND-005 | Test infrastructure | Contract runner may register the synthetic isolation contract twice | OPEN — candidate / cleanliness |
| BRD-CAND-006 | Deployment evidence | Latest-main CI/deployed runtime evidence requires explicit re-verification before any release-readiness claim | OPEN — evidence gap |

These entries must be validated against the current repository before being treated as confirmed defects.

## Phase 0 source-of-truth findings

These are governance findings discovered while establishing the single-source-of-truth control. They do not replace the Phase 1 business-rule audit.

| ID | Finding | Disposition |
|---|---|---|
| SOT-001 | docs/KFE-BUSINESS-RULES.md claimed authoritative business meaning while the new register also claimed authority | RESOLVED — substantive rules migrated into the register; competing file removed |
| SOT-002 | docs/KFE-EFFICIENT-PHASE-EXECUTION-PROTOCOL.md referenced the deleted legacy development roadmap | RESOLVED — protocol now defers sequencing to KFE_LAUNCH_MASTER_PLAN.md |
| SOT-003 | docs/KFE-PHASE-10-RELEASE.md could be read as the active release sequence | RESOLVED — marked historical/supporting record |
| SOT-004 | docs/KFE-VISUAL-PHASE-3-FREEZE.md could be read as a competing phase roadmap | RESOLVED — marked historical/supporting record |
| SOT-005 | runAllContracts.js registered the synthetic-isolation contract twice | RESOLVED — duplicate registration removed |
| SOT-006 | Canonical implementation ownership was implicit rather than centrally mapped | RESOLVED — authority matrix added to working rules and business-rule register |
| SOT-007 | Phase 0 acceptance was coupled to the broad Android/PWA CI path, causing unrelated emulator failures to appear as Phase 0 failures | RESOLVED — added dedicated docs-only Phase 0 Governance Gate; broad CI remains supporting repository CI and is not the Phase 0 acceptance gate |
