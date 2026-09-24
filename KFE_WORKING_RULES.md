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
