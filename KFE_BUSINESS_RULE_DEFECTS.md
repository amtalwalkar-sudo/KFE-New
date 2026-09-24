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

## Current known audit candidates

These are **pre-audit leads**, not yet confirmed defects. They must be validated during Phase 1.

| ID | Rule area | Candidate finding | Status |
|---|---|---|---|
| BRD-CAND-001 | Trip lifecycle | Repository `setTripStage(id, stage)` may accept arbitrary stage values without enforcing the canonical transition graph | OPEN — candidate |
| BRD-CAND-002 | Android overlay | END → fare uses a pending-action path that may lose the END command if process interruption occurs between completion and fare entry | OPEN — candidate |
| BRD-CAND-003 | Android release gate | Current Android CI smoke gate may not exercise the full Golden Ride Gate required for release verification | OPEN — candidate / gate evidence |
| BRD-CAND-004 | Release documentation | Android release-gate wording may contain stale cancellation semantics relative to the canonical rule that cancellation is available only during pickup | OPEN — candidate |
| BRD-CAND-005 | Test infrastructure | Contract runner may register the synthetic isolation contract twice | OPEN — candidate / cleanliness |
| BRD-CAND-006 | Deployment evidence | Latest-main CI/deployed runtime evidence requires explicit re-verification before any release-readiness claim | OPEN — evidence gap |

These entries must be validated against the current repository before being treated as confirmed defects.
