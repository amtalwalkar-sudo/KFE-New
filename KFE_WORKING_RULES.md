# KFE Working Rules

## Purpose

These rules govern all KFE development, audit, testing, fixes, UX work, Android overlay work, notifications, data work, and release preparation.

The repository is the persistent source of truth for the KFE launch process. Chat memory is not the project control mechanism.

## Non-negotiable rules

1. Follow `KFE_LAUNCH_MASTER_PLAN.md`.
2. Never silently change roadmap scope.
3. Use the cycle: **Audit → Document → Fix → Re-audit**.
4. New ideas, requests, redesigns, fixes, and deviations must pass the Deviation Gate before implementation.
5. No unclassified scope change gets implemented.
6. The current phase always has priority over attractive but non-essential work.
7. Do not implement unrelated redesign during an audit.
8. Every defect must be traceable to a rule, requirement, scenario, gate, or evidence gap.
9. Every roadmap addition or deviation must be recorded with its reason.
10. Do not declare a phase complete without satisfying its exit gate.
11. Do not declare launch readiness from CI/build success alone.
12. Preserve one canonical business source of truth. PWA, Android overlay, and notifications are surfaces of the same business state, not independent business systems.
13. A release candidate is immutable unless a change is explicitly recorded and the affected gate is rerun.
14. Prefer evidence from code, tests, runtime/device verification, and reconciliation over assumptions.

## Deviation Gate

Before implementing any new request:

1. Identify the current phase in `KFE_LAUNCH_STATUS.md`.
2. Determine whether the request:
   - is required by the current phase;
   - fixes a defect discovered by the current audit;
   - is a dependency for the current or next gate;
   - is a launch blocker;
   - belongs to a later phase;
   - is optional enhancement;
   - is not required.
3. Classify it exactly as one of:
   - **NOW / REQUIRED**
   - **LATER / REQUIRED LATER**
   - **BACKLOG / OPTIONAL ENHANCEMENT**
   - **NOT REQUIRED / REJECT**
   - **ROADMAP CHANGE** when the master plan itself genuinely needs amendment.
4. Record the classification in the appropriate audit, status, backlog, or defect document before implementation when the request is not already represented there.
5. Do not implement unrelated work merely because it is convenient or attractive.
6. If the roadmap itself changes, record the reason and affected gates explicitly.

## Audit discipline

- Discover first; fix second, unless a fix is strictly required to make the audit executable.
- Consolidate related defects before fixing them where practical.
- After fixes, rerun the affected audit and regression.
- Keep business-rule correctness separate from real-world operational correctness.
- Business Rules Audit includes Overlay and Notifications as business-rule contracts.
- Real-World Operational Audit includes actual Android/device behavior, interruptions, permissions, and realistic PWA/overlay usage.
- Synthetic and canonical data must remain isolated.

## Evidence standard

A result is not considered verified merely because:
- source code appears correct;
- a unit/contract test passes;
- CI is green;
- an APK artifact exists.

Where a gate requires runtime/device evidence, that evidence must actually exist.

## Phase authority

`KFE_LAUNCH_MASTER_PLAN.md` defines the sequence and gates.
`KFE_LAUNCH_STATUS.md` defines the active phase and current gate state.
`KFE_LAUNCH_BACKLOG.md` stores deferred work and roadmap deviations.
The business-rule documents govern Phase 1–3 rule discovery, defects, and re-audit.

If these documents disagree, do not silently choose one. Resolve the conflict explicitly and record the correction.

## Single Source of Truth — Phase 0 Exit Control

This is the mandatory authority hierarchy for the entire KFE project. It prevents two documents, two implementations, or two roadmaps from defining the same thing.

### 1. Business-rule authority — exactly one

**KFE_BUSINESS_RULES_REGISTER.md is the sole authoritative source for KFE business meaning and business-rule definitions.**

- A business rule is identified by a stable BR ID in this register.
- Supporting specifications, freezes, audits, implementation notes, tests, UI, Android code, and provider adapters may explain, implement, verify, or evidence a BR ID.
- They MUST NOT redefine a business rule independently.
- If supporting material conflicts with this register, the supporting material is stale or the register must be explicitly amended through governance control.
- A new business rule requires an explicit addition/change here before implementation is treated as authoritative.
- docs/KFE-BUSINESS-RULES.md was a competing authority and has been removed after its substantive rules were migrated into this register.

### 2. Implementation authority — exactly one canonical path per business concept

A concept may have multiple technical layers (domain, application, persistence, UI), but it has one canonical business path. UI, Android overlay, notifications, and read models are consumers/adapters, not alternative business implementations.

| Business area | Canonical implementation path | Surface/adapters |
|---|---|---|
| Business/master data | src/application/admin/adminService.js → src/repositories/adminRepository.js | Admin UI, synthetic adapter |
| Calendar/time semantics | src/domain/time/ist.js + consuming domain services | PWA/overlay displays |
| Shift/odometer/end-shift | src/domain/work/shift.js + src/domain/work/endShift.js → src/application/work/workService.js → src/repositories/shiftTripRepository.js | Work UI, overlay |
| Trip lifecycle | src/domain/work/tripLifecycle.js is the lifecycle authority; WorkService orchestrates and ShiftTripRepository persists | Work UI, overlay, notifications |
| Revenue | shifts.revenue is authoritative; src/domain/performance/authoritativeRevenue.js reads it; src/domain/work/revenueReconciliation.js reconciles supporting trip fares | Work, Timeline, Performance, overlay |
| Fuel | src/domain/work/fuel.js + src/repositories/fuelRepository.js | Work/Admin/Performance |
| Finance/loans | src/domain/finance/loanEngine.js + finance application/read-model adapters | Admin/Performance |
| Break-even/economics | src/domain/performance/authoritativeBreakEven.js + performanceEngineV2.js | Performance/targets |
| Driver Target | src/domain/performance/driverTargetStabilization.js → src/application/performance/driverTargetService.js | Work/Admin/Performance |
| Reporting/read models | Canonical domain/application calculations feed src/repositories/performanceRepository.js and timeline services; read models do not become authorities | Timeline/Performance/Admin |
| Overlay | src/infrastructure/android/kfeOverlay.js + native KfeOverlayService; commands return to the canonical Work/repository path | Android only |
| Notifications | src/infrastructure/android/kfeRideNotificationService.js + native notification bridge; notification events/actions return to canonical business paths | Android notifications |

Important: a repository is not a second business authority merely because it persists data. A domain/application calculation is not a second authority merely because it produces a read-model representation. The authority is the canonical business path identified above.

Known Phase-1 validation items remain explicitly tracked: setTripStage() currently writes arbitrary stage values instead of enforcing tripLifecycle.js, and the Android END→fare pending-action path requires interruption/replay verification. These are audit findings, not alternate authorities, and must be handled through the Phase 1→3 defect process rather than silently changing Phase 0 scope.

### 3. Roadmap authority — exactly one

- KFE_LAUNCH_MASTER_PLAN.md — only document that defines phase sequence, phase entry/exit gates, and launch sequence.
- KFE_LAUNCH_STATUS.md — current phase/state only; it does not create a different roadmap.
- KFE_WORKING_RULES.md — execution/governance/deviation policy only; it does not create a different roadmap.
- KFE_LAUNCH_BACKLOG.md — deferred items only; it does not create a different roadmap.
- Specialized gates/specifications/freezes/audits are supporting documents. They cannot reorder phases or authorize launch independently.
- Historical phase/freeze records are evidence only and must be explicitly marked historical/non-authoritative.

### 4. Evidence authority

Tests and contracts prove or disprove rules; they do not define business meaning.

The canonical grouped contract runner is src/tests/runAllContracts.js. Individual contract files are evidence modules. Duplicate registration of the same suite is prohibited.

### 5. Conflict rule

When two sources disagree:

**Rule register wins for business meaning → canonical implementation path wins for implementation mechanics → master plan wins for sequencing → status wins for current state.**

The disagreement must be corrected/documented; it must never be resolved by silently choosing whichever source is convenient.
