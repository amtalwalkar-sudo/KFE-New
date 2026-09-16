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
PHASE 7  Capacitor / Android Integration
   ↓
PHASE 8  Backup & Restore
   ↓
PHASE 9  Cloud Backup / Sync
   ↓
PHASE 10 Hardening / Release
```

## Current phase status
- **Phase 0:** COMPLETE — main baseline green.
- **Phase 1:** FROZEN — explicit freeze recorded; final verification CI #317 green.
- **Phase 2:** FROZEN — explicit freeze recorded in `docs/KFE-PHASE-2-FREEZE.md`; final verification CI #323 green.
- **Phase 3:** FROZEN — explicit freeze recorded in `docs/KFE-PHASE-3-FREEZE.md`; provider-independent Ride Capture boundary preserved.
- **Phase 4:** FROZEN — explicit freeze recorded in `docs/KFE-PHASE-4-FREEZE.md`; verification CI #332 green.
- **Phase 5:** FROZEN — calculation/performance integration completed and verified through the full CI gate.
- **Phase 6:** FROZEN — explicit freeze recorded in `docs/KFE-PHASE-6-FREEZE.md`.
- **Phase 7:** FROZEN — explicit freeze recorded in `docs/KFE-PHASE-7-FREEZE.md`; full verification CI #341 green.
- **Phase 8:** FROZEN — explicit freeze recorded in `docs/KFE-PHASE-8-FREEZE.md`; managed local backup/restore is complete and contract-covered.
- **Phase 9:** FROZEN — explicit freeze recorded in `docs/KFE-PHASE-9-FREEZE.md`; provider-independent cloud backup/sync orchestration is complete and contract-covered.
- **Phase 10:** IN PROGRESS — Hardening / Release; dedicated release gate added and full CI verification running.

## Phase 0 — Baseline & Governance
Establish the clean repository, CI, architecture, dependency, calculation-authority, and development-governance baseline. Exit: **MAIN BASELINE GREEN**.

## Phase 1 — Canonical Domain & Data Model
Define and freeze canonical data model, authority boundaries, relationships, UUIDs, timestamps/IST, validation/provenance, lifecycle/deletion, repository ownership, and mutation propagation. Exit: **CANONICAL DATA CONTRACT FROZEN**.

## Phase 2 — Data Persistence / Local-First
Implement provider-independent local persistence, repositories, transactions, migrations, indexes, UUIDs, metadata, soft deletion, and persistence contracts. Cloud backup/sync are not dependencies. Exit: **LOCAL-FIRST PERSISTENCE FROZEN**.

## Phase 3 — Ride Capture & Ingestion
Connect the frozen screenshot-fed Ride Capture design through a provider-independent multimodal extraction adapter, KFE validation, review/confirmation, and canonical Trip persistence. Operator-specific layouts remain adapter concerns and no OCR provider is selected by the canonical/application layer.

**Exit condition:** screenshot → injected extraction adapter → validated candidate → review/confirmation → canonical Trip record.

## Phase 4 — Operational Records
Implement canonical operational records needed for real vehicle operation: shifts, odometer, refuelling, expenses, revenue, and related inputs. Reconstruct a working shift/day from canonical records without introducing a competing aggregate authority.

**Exit condition:** a canonical Shift can be reconstructed with its Trips, authoritative revenue/business KM, odometer-derived vehicle/dead KM where available, relevant fuel, and shift toll/parking inputs.

## Phase 5 — Calculation & Performance Integration
Connect validated canonical records to the protected authoritative calculation chain while preserving one authority per concept. Integrate actual economics, fuel cost/efficiency, maintenance provision, financing, renewal provision, monthly break-even, and Driver Target through their existing domain owners and expose only derived representations through the application performance boundary.

**Exit condition:** a reproducible selected-period performance result is produced from canonical inputs, with authoritative monthly break-even and Driver Target consumed from their single owners, no duplicate formulas, explicit unavailable states, and passing full CI.

## Phase 6 — Dashboard / UX
Build production-facing screens consuming application/domain outputs without recreating business formulas in UI.

**Exit condition:** production PWA presentation layer is wired to the established application/domain boundaries and passes the full CI gate. Freeze recorded in `docs/KFE-PHASE-6-FREEZE.md`.

## Phase 7 — Capacitor / Android Integration
Wrap the verified production PWA in Capacitor without moving business authority into the native shell. The Android project consumes the production `dist` output, preserves the existing web application as the UI source, and includes the native Capacitor integrations already required by the application.

**Exit condition:** Phase 7 integration contract passes; production PWA assets build successfully; `npx cap sync android` succeeds; Android debug APK builds successfully in CI.

## Phase 8 — Backup & Restore
Implement complete managed local backup/restore, validation, versioning, migration compatibility, and safe restoration.

**Exit condition:** a complete canonical snapshot can be validated/serialized, exported to and imported from a file, retained as a local recovery copy, restored only after validation and explicit confirmation at the UI boundary, and atomically written to the canonical local database with a recovery copy refreshed from the restored dataset.

## Phase 9 — Cloud Backup / Sync
Add provider-independent cloud backup/sync while preserving local-first operation and the established provider-independent application/domain boundaries. Cloud backup may use an injected infrastructure provider; cloud sync uses an injected `sync()` provider and operates on mutation envelopes. A provider failure leaves local canonical data authoritative and mutations retryable. Pulled changes cross into the application through an explicit `applyRemoteChanges` boundary rather than embedding provider or business logic in the sync service.

**Exit condition:** cloud backup lifecycle and provider-independent sync orchestration are contract-covered, online/offline behavior is explicit, local mutations are acknowledged/removed only after successful provider acknowledgement, failures remain retryable, pulled changes cross an explicit application boundary, and the full CI gate passes.

## Phase 10 — Hardening / Release
Complete full-system testing, migration/corruption/offline/large-history testing, security/performance review, PWA/Capacitor/Android release validation, and release procedures.

**Exit condition:** dedicated Phase 10 hardening/release gate passes together with the full contract suite, production PWA build, Capacitor Android synchronization, and Android debug APK build, establishing the **RELEASE CANDIDATE** baseline.

## Efficient phase execution protocol
```text
PHASE START → ① Phase Contract → ② Comprehensive Gap Audit → ③ Batch/Classify ALL findings → ④ ONE Coordinated Correction Pass → ⑤ ONE Focused Phase Test Gate → ⑥ Holistic Regression Audit → ⑦ ONE Full CI Verification → ⑧ Phase Completion / Freeze-Readiness → NEXT PHASE
```

CI failures follow `docs/KFE-HOLISTIC-CI-FAILURE-PROTOCOL.md`; no single-failure correction loop. Frozen decisions require explicit drift review before amendment. Do not silently skip or reorder phases.
