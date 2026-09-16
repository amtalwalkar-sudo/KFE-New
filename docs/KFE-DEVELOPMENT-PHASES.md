# KFE Development Phases

## Operating rule

KFE development proceeds chronologically through the phases below. After each phase, the next remaining phases are explicitly identified before proceeding.

```text
PHASE 0  Baseline & Governance
   ↓
PHASE 1  Canonical Domain & Data Model
   ↓
PHASE 2  Data Persistence / Local-First
   ↓
PHASE 3  Ride Capture & Ingestion
   ↓
PHASE 4  Operational Records
   ↓
PHASE 5  Calculation & Performance Integration
   ↓
PHASE 6  Dashboard / UX
   ↓
PHASE 7  Backup & Restore
   ↓
PHASE 8  Cloud Backup
   ↓
PHASE 9  Multi-Device Sync
   ↓
PHASE 10 Hardening / Release
```

## Phase 0 — Baseline & Governance

Establish the clean repository, CI, architecture, dependency, calculation-authority, and development-governance baseline.

Exit condition: **MAIN BASELINE GREEN**.

## Phase 1 — Canonical Domain & Data Model

Define and freeze the canonical KFE data model, authoritative versus derived data, relationships, UUID strategy, timestamps, IST calendar semantics, validation/status/provenance, deletion/versioning rules, and domain boundaries.

Exit condition: **CANONICAL DATA CONTRACT FROZEN**.

## Phase 2 — Data Persistence / Local-First

Implement provider-independent local persistence, repositories, transactions, migrations, indexes, UUIDs, metadata, soft deletion, and persistence contracts.

Exit condition: KFE operates and retains its dataset locally without cloud availability.

## Phase 3 — Ride Capture & Ingestion

Connect the frozen screenshot-fed Ride Capture design through a provider-independent multimodal extraction adapter, KFE validation, review/confirmation, and canonical Ride persistence.

Exit condition: a ride screenshot can produce a validated canonical Ride record.

## Phase 4 — Operational Records

Implement the canonical operational records needed for real vehicle operation: shifts, odometer, refuelling, expenses, revenue, and related inputs.

Exit condition: KFE can reconstruct an operational working day/shift from persisted records.

## Phase 5 — Calculation & Performance Integration

Connect validated canonical records to the existing authoritative calculation chain while preserving one authority per concept and the established internal/public unavailable-value semantics.

Exit condition: real persisted KFE data feeds the protected calculation chain correctly.

## Phase 6 — Dashboard / UX

Build production-facing screens around application/domain outputs. UI must consume authoritative service outputs rather than independently recreating business formulas.

Exit condition: users can operate KFE through the intended product UI.

## Phase 7 — Backup & Restore

Implement a complete managed local backup/restore format, validation, versioning, migration compatibility, and safe restoration to another device.

Exit condition: a complete KFE dataset can be backed up and restored reliably.

## Phase 8 — Cloud Backup

Add provider-independent cloud backup with daily automatic backup and manual backup while preserving local-first operation.

Exit condition: cloud backup can reliably recover the KFE dataset.

## Phase 9 — Multi-Device Sync

Implement authorized multi-device synchronization, change tracking, offline queues, conflict handling, deletion propagation, retries, and convergence.

Exit condition: authorized devices can work offline and converge safely.

## Phase 10 — Hardening / Release

Complete full-system testing, migration and corruption testing, offline/large-history testing, performance/security review, PWA/Capacitor/Android release validation, and release procedures.

Exit condition: **RELEASE CANDIDATE**.

## Current phase status

- **Phase 0:** COMPLETE — main baseline green.
- **Phase 1:** FROZEN — explicit freeze recorded in `docs/KFE-PHASE-1-FREEZE.md`; final verification CI #317 green.
- **Phase 2:** IN PROGRESS — local-first persistence contract and contract coverage are being completed under the bounded phase protocol.

## Efficient phase execution protocol

Every phase uses one bounded engineering cycle rather than a serial fix/test loop:

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

### Phase-cycle rules

- Audit the complete phase scope before correcting isolated findings.
- Batch related implementation, architecture, calculation, data, contract, test, and documentation gaps.
- Classify findings as **must-fix**, **phase-completion gap**, or **future-phase** work.
- Resolve related must-fix and phase-completion findings in one coordinated correction pass where practical.
- Do not repeatedly rediscover or re-test already-closed findings unless a regression audit requires it.
- Run one focused phase test gate after the coordinated correction pass.
- Perform one holistic regression audit before verification CI.
- Normally run one complete CI verification per phase exit.
- If CI is red, `docs/KFE-HOLISTIC-CI-FAILURE-PROTOCOL.md` takes precedence; do not enter a single-failure correction loop.
- A phase is not automatically frozen by passing tests or CI. Complete a freeze-readiness assessment and obtain explicit approval before recording a freeze.
- Do not pull work from later phases into the current phase unless required to preserve an established boundary or explicit dependency.

## Phase discipline

- Do not silently skip or reorder phases.
- A phase is complete only when its exit condition is satisfied.
- Architecture and frozen decisions must not be weakened or reinterpreted without explicit design-drift review.
- Feature work must preserve established authority ownership and provider boundaries.
- CI failures follow `docs/KFE-HOLISTIC-CI-FAILURE-PROTOCOL.md`.
