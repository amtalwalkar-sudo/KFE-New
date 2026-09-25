# KFE Launch Master Plan

**Status:** Authoritative  
**Version:** 1.0  
**Created:** 2026-09-24

## Launch principle

> KFE is developed toward launch through controlled phases. Each phase is audited, defects are fixed, and the phase is re-audited before progression. New ideas or deviations are never silently implemented. Every deviation is analysed, classified as NOW / LATER / BACKLOG / NOT REQUIRED, documented, and only then acted upon.

> **The current phase always has priority over attractive but non-essential work.**

## Critical device-testing sequencing rule

**Physical Android/phone testing is deferred until after Phase 13 — Final Release Gate.** It is the final validation activity of the entire launch plan, not a prerequisite for Phases 5–13.

Device-only scenarios must remain explicitly deferred and must never be marked PASS from CI, browser automation, simulation, emulator evidence, or documentation alone. The final device audit requires real-device/build evidence.

## Phase sequence

| Phase | Name | Entry | Exit |
|---|---|---|---|
| 0 | Roadmap Control | Control documents established | Working rules, master plan, status, backlog, and audit control structure exist and agree |
| 1 | Business Rules Audit | Phase 0 complete | Complete authoritative rule inventory and evidence-based audit with defects/gaps recorded |
| 2 | Fix Business-Rule Defects | Phase 1 defect set complete | All accepted business-rule defects fixed or explicitly dispositioned |
| 3 | Business Rules Re-Audit | Phase 2 complete | Business rules clean and regression evidence recorded |
| 4 | Real-World Operational Audit | Phase 3 clean | Non-device operational audit complete; device-only scenarios explicitly deferred to the final post-Phase-13 audit |
| 5 | Fix Operational Defects | Phase 4 non-device defect set complete | All accepted non-device operational defects fixed or explicitly dispositioned |
| 6 | Operational Re-Audit | Phase 5 complete | Non-device operational scenarios clean and regression evidence recorded |
| 7 | Data / Recovery Gate | Phase 6 clean | Backup/export/restore, isolation, reset/recovery evidence complete |
| 8 | Security / Permissions Gate | Phase 7 complete | Practical permissions/security checks complete |
| 9 | Production Configuration Gate | Phase 8 complete | Production configuration verified with no test/synthetic leakage |
| 10 | Release Candidate Freeze | Phase 9 complete | Exact commit, PWA build, APK, and version frozen |
| 11 | Controlled Real-World Pilot | Phase 10 frozen | Controlled real business activity completed with captured evidence |
| 12 | Pilot Reconciliation | Phase 11 complete | Pilot activity reconciles across operational and financial outputs |
| 13 | Final Release Gate | Phase 12 clean | Exact release candidate satisfies all launch evidence requirements |
| Launch | Real-world operation | Phase 13 pass | KFE released for intended real-world operation |

## Phase 4 — Real-World Operational Audit

Question:

> Does KFE work under the applicable operational conditions that can be verified without the physical device at this checkpoint?

Scenario groups remain A–J. Automated/browser evidence is supporting evidence only.

Device-only scenarios deferred to after Phase 13:
- C1–C5 — overlay-heavy operation
- E1–E2 — PWA ↔ overlay operation
- F2–F3 — force-stop and screen-lock/unlock recovery

## Phase 5 — Fix Operational Defects

Consolidate the applicable Phase 4 non-device operational defects. Fix only accepted defects from that set; do not introduce unrelated redesign.

For the 2026-09-26 checkpoint, the non-device defect set is empty. Therefore Phase 5 closes with **NO DEFECTS / NO IMPLEMENTATION REQUIRED**.

## Phase 6 — Operational Re-Audit

Rerun the applicable non-device operational scenarios and relevant regression against the Phase 5 exit baseline. Device-only scenarios remain deferred and cannot be converted to PASS.

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

After Phase 13, execute the deferred physical-device audit as the final validation activity of the entire launch plan.

## Scope control

All new requests pass the Deviation Gate in `KFE_WORKING_RULES.md`.

No request can bypass the active phase merely because it is desirable.
