# KFE Launch Master Plan

**Status:** Authoritative  
**Version:** 1.0  
**Created:** 2026-09-24

## Launch principle

> KFE is developed toward launch through controlled phases. Each phase is audited, defects are fixed, and the phase is re-audited before progression. New ideas or deviations are never silently implemented. Every deviation is analysed, classified as NOW / LATER / BACKLOG / NOT REQUIRED, documented, and only then acted upon.

> **The current phase always has priority over attractive but non-essential work.**

## Phase sequence

| Phase | Name | Entry | Exit |
|---|---|---|---|
| 0 | Roadmap Control | Control documents established | Working rules, master plan, status, backlog, and audit control structure exist and agree |
| 1 | Business Rules Audit | Phase 0 complete | Complete authoritative rule inventory and evidence-based audit with defects/gaps recorded |
| 2 | Fix Business-Rule Defects | Phase 1 defect set complete | All accepted business-rule defects fixed or explicitly dispositioned |
| 3 | Business Rules Re-Audit | Phase 2 complete | Business rules clean and regression evidence recorded |
| 4 | Real-World Operational Audit | Phase 3 clean | Real-device/scenario audit complete with operational defects recorded |
| 5 | Fix Operational Defects | Phase 4 defect set complete | All accepted operational defects fixed or explicitly dispositioned |
| 6 | Operational Re-Audit | Phase 5 complete | Operational scenarios clean and regression evidence recorded |
| 7 | Data / Recovery Gate | Phase 6 clean | Backup/export/restore, isolation, reset/recovery evidence complete |
| 8 | Security / Permissions Gate | Phase 7 complete | Practical permissions/security checks complete |
| 9 | Production Configuration Gate | Phase 8 complete | Production configuration verified with no test/synthetic leakage |
| 10 | Release Candidate Freeze | Phase 9 complete | Exact commit, PWA build, APK, and version frozen |
| 11 | Controlled Real-World Pilot | Phase 10 frozen | Controlled real business activity completed with captured evidence |
| 12 | Pilot Reconciliation | Phase 11 complete | Pilot activity reconciles across operational and financial outputs |
| 13 | Final Release Gate | Phase 12 clean | Exact release candidate satisfies all launch evidence requirements |
| Launch | Real-world operation | Phase 13 pass | KFE released for intended real-world operation |

## Phase 0 — Roadmap Control

Establish and maintain:

- `KFE_WORKING_RULES.md`
- `KFE_LAUNCH_MASTER_PLAN.md`
- `KFE_LAUNCH_STATUS.md`
- `KFE_LAUNCH_BACKLOG.md`
- `KFE_BUSINESS_RULES_REGISTER.md`
- `KFE_BUSINESS_RULES_AUDIT.md`
- `KFE_BUSINESS_RULE_DEFECTS.md`

Phase 0 is a control phase, not a product redesign phase.

## Phase 1 — Business Rules Audit

Objective:

> Prove that KFE correctly implements the intended business.

Audit the complete rule chain:

**raw input → input channel/system capture → canonical storage → calculation → derived value → display → cross-surface consistency.**

Group the audit into:

1. Business foundation
2. Master data
3. Business calendar
4. Driver/shift
5. Trip lifecycle
6. Operating expenses
7. Finance
8. Targets/economics
9. Reporting/reconciliation
10. Overlay/notifications business-rule contracts

Overlay and notifications are first-class business-rule surfaces in this phase.

## Phase 2 — Fix Business-Rule Defects

Fix the consolidated Phase 1 defect set systematically. Each fix must reference the relevant rule/defect ID. Do not introduce unrelated redesign.

## Phase 3 — Business Rules Re-Audit

Rerun failed rules and affected regression. Exit only when the business-rule system is clean.

## Phase 4 — Real-World Operational Audit

Question:

> Does KFE actually work when a real driver uses a real phone under realistic conditions?

Scenario groups:

- A — Normal working day
- B — Human mistakes
- C — Overlay-heavy operation
- D — PWA-heavy operation
- E — Mixed PWA ↔ overlay operation
- F — Interruption/recovery
- G — GPS/permission problems
- H — Financial reconciliation
- I — Multi-day continuity
- J — Boundary conditions

## Phase 5 — Fix Operational Defects

Consolidate and fix Phase 4 operational defects. No unrelated redesign.

## Phase 6 — Operational Re-Audit

Rerun failed scenarios and relevant regression. Exit only when operationally clean.

## Phase 7 — Data / Recovery Gate

Practical evidence for:

- backup/export;
- restore;
- canonical/synthetic isolation;
- reinstall/reset behavior;
- no silent corruption;
- recovery procedure.

No enterprise DR programme is required.

## Phase 8 — Security / Permissions Gate

Practical checks for:

- required permissions;
- GPS denial;
- notification denial;
- overlay denial;
- production build cleanliness;
- accidental secrets;
- inappropriate data exposure.

## Phase 9 — Production Configuration Gate

Verify:

- production URL;
- timezone;
- business configuration;
- database;
- PWA manifest;
- service worker;
- Android package/version;
- notification configuration;
- GPS configuration;
- no test/synthetic leakage.

## Phase 10 — Release Candidate Freeze

Freeze the exact:

- Git commit;
- PWA build;
- Android APK;
- version.

Any subsequent change creates a new release candidate and requires the relevant gate(s) to be rerun.

## Phase 11 — Controlled Real-World Pilot

Use KFE for actual business activity in a controlled manner. Capture enough evidence for reconciliation.

## Phase 12 — Pilot Reconciliation

Reconcile real activity against KFE for:

- trips;
- fares;
- cancellations;
- odometer;
- GPS;
- fuel;
- expenses;
- targets;
- shift totals;
- daily totals;
- Timeline;
- Performance;
- overlay;
- notifications;
- financial totals.

## Phase 13 — Final Release Gate

Question:

> Is this exact release candidate ready for real-world operation?

Evidence must cover the preceding audits and gates. Only a passing gate permits launch.

## Scope control

All new requests pass the Deviation Gate in `KFE_WORKING_RULES.md`.

No request can bypass the active phase merely because it is desirable.

