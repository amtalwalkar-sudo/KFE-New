# KFE Launch Master Plan

**Status:** Authoritative
**Current product scope:** `KFE_BUSINESS_RULES_REGISTER.md`
**Current Android acceptance:** `KFE_ANDROID_RELEASE_GATE.md`

This plan retains the numbered governance gates while updating their meaning to the simplified KFE product. Older phase-freeze documents and CI records are historical evidence only; they cannot restore retired features or override current authorities.

## Current product boundary

1. PWA-owned shift start/end and shared Work/ride workflow.
2. Native Android overlay for ride actions during an active shift.
3. Four offline-capable, event-time GPS snapshots.
4. Read-only Timeline with user-initiated, manual-only locality resolution.
5. Basic recorded-data Performance.
6. Basic Admin forms and saved source data.
7. Essential local backup, Dropbox backup, restore and recovery safeguards.

No retired targets, provisions, forecasts, break-even, profitability, loan amortization/payment allocation, personal/dead-kilometre allocation, movement reconciliation, ride-distance/route calculations, OCR ride import, or separate notification product may be reintroduced without explicit user approval.

## Phase sequence

| Phase | Name | Exit |
|---|---|---|
| 0 | Roadmap Control | Current scope, authorities and release sequence agree |
| 1 | Business Rules Audit | Current business-rule register is complete and authoritative |
| 2 | Fix Business-Rule Defects | Accepted in-scope rule defects fixed or explicitly dispositioned |
| 3 | Business Rules Re-Audit | Current business rules and calculation boundaries verified |
| 4 | Whole-Application Architecture Audit | PWA, application, domain, persistence and Capacitor ownership audited |
| 5 | Architecture and Product Cleanup | In-scope defects fixed; obsolete active paths/docs removed or classified historical |
| 6 | Operational Re-Audit | Work, Timeline, Performance and Admin source flows verified in automation |
| 7 | Data / Recovery Gate | Backup/export/restore, reset and recovery safeguards verified |
| 8 | Security / Permissions Gate | Permission denial, Android capability and security boundaries verified |
| 9 | Production Configuration Gate | Production PWA and Android configuration verified |
| 10 | Release Candidate Freeze | Exact source commit, PWA build and APK identity fixed for acceptance |
| 11 | Controlled Real-World / Physical-Device Pilot | Exact APK exercised on the target phone; real-world workflow and GPS evidence recorded |
| 12 | Pilot Reconciliation | Phone activity, saved rides/fuel, Timeline, Performance, Admin and backup state reconcile |
| 13 | Final Release Gate | Latest exact revision has green CI, required device evidence and no unresolved release blocker |
| Launch | Real-world operation | Phase 13 pass and explicit release authorization |

## Critical device-evidence rule

Physical Android/phone testing is part of Phase 11 and must occur before Phase 12 reconciliation and Phase 13 final release approval. It is not deferred until after the final release gate.

CI, browser automation, source inspection, emulator smoke and APK creation do not prove physical-device behavior. Missing device evidence remains pending and must never be marked PASS.

## Current acceptance sequence

1. Complete source/documentation cleanup on PR #412.
2. Run all governance, business-foundation, UI-isolation, PWA build/runtime, persistence/recovery and Android exact-APK emulator gates on the latest head.
3. Install that exact APK on the target phone and follow `KFE_ANDROID_RELEASE_GATE.md`.
4. Fix any observed defect, rebuild, and rerun affected gates.
5. Reconcile saved activity and recovery evidence.
6. Confirm final release gates and obtain explicit user authorization before merge/release.

## Change control

- The business-rule register owns business meaning and formulas.
- The architecture contract owns layer and platform ownership.
- The canonical data contract owns stored facts, relationships and preservation.
- The operational lifecycle contract owns shift/trip transitions.
- The Android release gate owns Android acceptance scenarios.
- The launch status file records current progress; it does not redefine any authority.
- Do not merge PR #412 without explicit user authorization.
