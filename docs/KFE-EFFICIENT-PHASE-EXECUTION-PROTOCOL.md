# KFE Efficient Phase Execution Protocol

## Purpose

KFE phases are executed as bounded engineering cycles. The goal is to preserve controlled design, authority ownership, and regression protection without falling into repeated single-failure correction loops.

## Standard cycle

```text
PHASE START
    ↓
① Phase Contract
    ↓
② Comprehensive Gap Audit
    ↓
③ Batch/Classify ALL findings
    ↓
④ ONE Coordinated Correction Pass
    ↓
⑤ ONE Focused Phase Test Gate
    ↓
⑥ Holistic Regression Audit
    ↓
⑦ ONE Full CI Verification
    ↓
⑧ Phase Completion / Freeze-Readiness
    ↓
NEXT PHASE
```

## 1. Phase Contract

Define the phase scope, exit condition, dependencies, protected architecture, authoritative concepts, and explicit out-of-scope work.

Do not silently expand the phase into later-phase functionality.

## 2. Comprehensive Gap Audit

Inspect the complete phase surface before making isolated corrections. Follow dependencies across implementation, persistence, normalization, domain logic, services, state, UI/integration boundaries, tests/contracts, and documentation as applicable to the phase.

## 3. Batch and classify findings

Classify every finding:

- **🔴 Must-fix** — violates architecture, frozen design, authority ownership, calculation semantics, data contract, persistence/mutation contract, or another required invariant.
- **🟡 Phase-completion gap** — required for the current phase exit but not necessarily a defect in already-working behavior, such as missing contract coverage or incomplete boundary tests.
- **🟢 Future-phase** — intentionally belongs to a later phase and should not be pulled forward without a dependency reason.

Related findings should be grouped before correction.

## 4. One coordinated correction pass

Resolve the identified current-phase findings together where practical. Preserve frozen decisions and provider boundaries. Do not weaken tests, delete contracts, bypass validation, or create duplicate authorities merely to make a gate pass.

If a finding reveals a design conflict, stop normal correction flow and perform explicit design-drift review.

## 5. One focused phase test gate

After the coordinated correction pass, run the complete test/contract surface relevant to the phase. This is the phase gate, not a substitute for final CI.

Do not repeatedly run a narrow test after each individual line-level correction unless required for safe development diagnostics.

## 6. Holistic regression audit

Review the correction against:

- architecture and frozen decisions
- authority ownership and calculation lineage
- persistence and normalization
- relationships and historical/as-of semantics
- time, period, unit, sign, and precision boundaries
- mutation propagation and state refresh
- adjacent features and edge cases
- tests, contracts, fixtures, specifications, and documentation

Confirm that the correction did not introduce a competing authority or silently change an existing invariant.

## 7. One full CI verification

Once the focused phase gate and holistic audit are clean, run one complete CI verification covering the repository's configured test/build/integration stages.

Normally there is one verification CI per phase exit.

## 8. Phase completion / freeze-readiness

Report:

- phase status
- completed scope
- unresolved findings, if any
- future-phase items deliberately deferred
- CI result
- freeze-readiness status
- next phase and all remaining phases

Passing CI does not automatically freeze the phase. A freeze requires explicit user approval.

## CI-red override

If full CI fails, this protocol does not replace the repository's holistic CI failure protocol. `docs/KFE-HOLISTIC-CI-FAILURE-PROTOCOL.md` takes precedence.

The required flow remains:

```text
CI RED
→ holistic investigation
→ dependency / authority / boundary audit
→ identify ALL related issues
→ coordinated corrections
→ regression audit
→ ONE verification CI
```

Never use:

```text
CI RED
→ fix one line
→ CI
→ fix next line
→ CI
```

## Phase ordering

This protocol does not define or own the KFE roadmap. It must not be used to infer phase sequence.

The authoritative chronological roadmap is KFE_LAUNCH_MASTER_PLAN.md. The active phase is KFE_LAUNCH_STATUS.md. This protocol only defines an efficient execution cycle inside whichever phase is active.

Any conflict between this protocol and the master plan is resolved in favor of the master plan.
