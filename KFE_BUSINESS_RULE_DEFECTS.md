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
| BRD-002 | BR-01 Business start boundary | Historical finding: Business Start Date was missing. | HISTORICAL — current Admin definition and Phase 2 formula contract confirm the required field exists. |
| BRD-005 | BR-01 Business start boundary | Historical finding: acquisition date was used as surrogate boundary. | HISTORICAL — current adapter reads `snapshot.businessSetup.businessStartDate`; Phase 2 contract distinguishes acquisition date. |
| BRD-007 | BR-01 Historical maintenance recovery | Historical finding: historical recovery path was missing. | HISTORICAL — current engine implements ₹0.40/km and 12-month recovery; formula contract passed in CI #2214. |
| BRD-008 | BR-01 Predictive maintenance provision | Historical finding: Admin default differed from ₹1.60/km. | HISTORICAL — current default is ₹1.60/km; calculation contract passed in CI #2214. |
| BRD-009 | BR-01 Pre-business loan recovery | Historical finding: active path used surrogate boundary. | HISTORICAL — active adapter calls the canonical origin-based helper with Business Start Date; legacy helper duplication remains a separate cleanup candidate. |

## Dispositioned provisional findings

| ID | Previous finding | Disposition |
|---|---|---|
| BRD-001 | No generic Admin business-configuration form | **ACCEPTED / DISPOSITIONED** — authoritative inputs are defined by business concept; no generic configuration entity is required by frozen BR-01. |
| BRD-003 | No generic opening-balance input | **ACCEPTED / DISPOSITIONED** — opening values use existing authoritative underlying facts/records. |
| BRD-004 | No dedicated historical/pre-business expense source form | **ACCEPTED / DISPOSITIONED** — historical maintenance is derived from opening odometer; loan burden comes from authoritative loan records. |
| BRD-006 | No generic opening-balance entity/fact in finance chain | **ACCEPTED / DISPOSITIONED** — no parallel generic opening-balance source is allowed by BR-01. |

## Evidence boundary

The rows above originated as Phase 1 findings. Their current implementation status has been re-audited against the authoritative Admin definitions, finance adapter, loan engine, historical maintenance calculation, and passing Phase 2 business-rule contract. BRD-009's old helper remains in the module as a legacy duplicate; the active finance adapter uses the origin-based canonical helper.

## Current known audit candidates

These are pre-audit leads retained for later validation.

| ID | Rule area | Candidate finding | Status |
|---|---|---|---|
| BRD-CAND-001 | Trip lifecycle | Repository `setTripStage(id, stage)` may accept arbitrary stage values without enforcing the canonical transition graph | VERIFIED FIX — repository uses domain `transitionTripStage`; canonical lifecycle contract passed. |
| BRD-CAND-002 | Android overlay | END → fare uses a pending-action path that may lose the END command if process interruption occurs between completion and fare entry | OPEN — not covered by full Golden Ride interruption/replay test |
| BRD-CAND-003 | Android release gate | Android CI smoke tests cover WebView startup and overlay creation only; they do not exercise the full Golden Ride Gate, persisted parity, or interruption/replay | OPEN — release blocker until Golden Ride emulator gate exists and passes |
| BRD-CAND-004 | Release documentation | Android release-gate cancellation semantics may be stale | VERIFIED — gate correctly restricts cancellation to pickup and specifies blank fee = ₹0; blank fee normalization now has a regression assertion |
| BRD-CAND-005 | Test infrastructure | Contract runner may register the synthetic isolation contract twice | RESOLVED during Phase 0 |
| BRD-CAND-006 | Deployment evidence | Latest-main CI/deployed runtime evidence requires explicit re-verification before any release-readiness claim | VERIFIED FOR BASELINE — CI #2214 build/test, Android gate and Pages deploy/runtime passed; recheck after subsequent commits. |
| BRD-CAND-007 | Native background GPS | Starting the same trip's passenger-ride GPS phase returned early while the pickup trace callback was active, leaving ride points classified as dead movement | SOURCE/CONTRACT PRESENT — phase transition restarts callback; physical-device acceptance remains pending. |
| BRD-CAND-008 | Android CI gate | Android instrumentation reported assertion failures while the workflow step still returned success | VERIFIED FOR BASELINE — Android release gate succeeded in CI #2214 with instrumentation result checks. |
| BRD-CAND-009 | Overlay revenue authority | Native overlay payload summed optional trip fares rather than reading authoritative shift revenue | VERIFIED FIX — overlay payload mirrors shift revenue; native authority contract passed in CI #2214. |
| BRD-CAND-010 | Overlay theme | Work payload omitted theme, causing native overlay to default to light palette regardless of app theme | VERIFIED SOURCE/CONTRACT — theme controller resolves day/night and native overlay maps both palettes; physical-device visual acceptance remains pending. |
| BRD-CAND-011 | Cancellation revenue | Blank cancellation fare persisted as null instead of ₹0 required by Android release contract | VERIFIED FIX — blank cancellation revenue normalizes to zero with regression coverage in CI #2214. |
| BRD-CAND-012 | Driver target progress | Current target achieved/progress is sourced from completed-shift revenue; active shift revenue remains zero until End Shift, so target progress does not reflect activity during the active shift | OPEN — frozen Work cockpit requires current achieved/progress; business authority forbids promoting optional trip fares to authoritative revenue, so the interim progress rule needs an explicit business decision |
| BRD-CAND-013 | Background overlay GPS display | Native GPS recording continued independently, but overlay live KM refresh depended on WebView-driven overlay updates while backgrounded | SOURCE PATH PRESENT — native collector updates overlay live KM; screen-off/background acceptance remains pending physical-device testing. |
| BRD-CAND-014 | Presentation modernization command | `npm run ui:impact -- <src/path>` is an impact/dependency guard, not a command that modernizes/replaces a screen by itself | OPEN — presentation isolation exists, but a one-command modernization workflow is not implemented; keep this separate from business-logic changes |
| BRD-CAND-015 | Native overlay fare capture | Completed-trip fare form could lose its completed-trip identity when the active swipe action returned to GO_TO_PICKUP | FIX IN PROPOSED BRANCH — separate pending-fare identity and explicit skipped state are wired through cockpit and native form; CI and exact-APK Golden Ride acceptance pending. |
| BRD-CAND-016 | Native GPS stop race | A delayed stop request for a completed trip could stop a newer trip's collector because ACTION_STOP ignored trip identity | FIX IN PROPOSED BRANCH — stop checks active/requested IDs and has an Android instrumentation assertion; CI pending. |

The original Phase 1 findings are preserved as history. Current source and CI evidence were re-audited on 2026-10-02; proposed branch fixes remain unverified until branch CI passes. See `docs/PRELAUNCH-SOURCE-RECONCILIATION-2026-10-02.md`.

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
