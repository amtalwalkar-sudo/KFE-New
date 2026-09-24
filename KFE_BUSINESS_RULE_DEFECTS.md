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
| BRD-002 | BR-01 Business start boundary | No authoritative `businessStartDate` input exists in Admin source definitions. | OPEN |
| BRD-005 | BR-01 Business start boundary | `financePerformanceAdapter.js` derives business start from earliest vehicle `acquiredOn`, contrary to frozen BR-01. | OPEN |
| BRD-007 | BR-01 Historical maintenance recovery | No canonical opening-odometer × ₹0.40/km historical burden and 12-month date-to-date recovery path exists. | OPEN |
| BRD-008 | BR-01 Predictive maintenance provision | Admin maintenance-rate definition defaults to ₹2/km, while frozen BR-01 requires ₹1.60/km. | OPEN |
| BRD-009 | BR-01 Pre-business loan recovery | `calculatePreBusinessRecovery` uses the surrogate boundary and overdue-row logic rather than frozen origin-based classification from authoritative Business Start Date. | OPEN |

## Dispositioned provisional findings

| ID | Previous finding | Disposition |
|---|---|---|
| BRD-001 | No generic Admin business-configuration form | **ACCEPTED / DISPOSITIONED** — authoritative inputs are defined by business concept; no generic configuration entity is required by frozen BR-01. |
| BRD-003 | No generic opening-balance input | **ACCEPTED / DISPOSITIONED** — opening values use existing authoritative underlying facts/records. |
| BRD-004 | No dedicated historical/pre-business expense source form | **ACCEPTED / DISPOSITIONED** — historical maintenance is derived from opening odometer; loan burden comes from authoritative loan records. |
| BRD-006 | No generic opening-balance entity/fact in finance chain | **ACCEPTED / DISPOSITIONED** — no parallel generic opening-balance source is allowed by BR-01. |

## Evidence boundary

These classifications are based on the frozen BR-01 specification and the inspected canonical Admin, performance, finance-adapter and loan-engine paths. No Phase 2 implementation fixes have been applied.

## Current known audit candidates

These are pre-audit leads retained for later validation.

| ID | Rule area | Candidate finding | Status |
|---|---|---|---|
| BRD-CAND-001 | Trip lifecycle | Repository `setTripStage(id, stage)` may accept arbitrary stage values without enforcing the canonical transition graph | OPEN — candidate |
| BRD-CAND-002 | Android overlay | END → fare uses a pending-action path that may lose the END command if process interruption occurs between completion and fare entry | OPEN — candidate |
| BRD-CAND-003 | Android release gate | Current Android CI smoke gate may not exercise the full Golden Ride Gate required for release verification | OPEN — candidate / gate evidence |
| BRD-CAND-004 | Release documentation | Android release-gate wording may contain stale cancellation semantics relative to the canonical rule that cancellation is available only during pickup | OPEN — candidate |
| BRD-CAND-005 | Test infrastructure | Contract runner may register the synthetic isolation contract twice | RESOLVED during Phase 0 |
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
