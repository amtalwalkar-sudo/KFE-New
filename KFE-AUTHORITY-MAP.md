# KFE Authority Map

**Status:** AUTHORITATIVE — GOVERNANCE INDEX ONLY  
**Purpose:** The single index that answers which document owns each KFE responsibility and prevents parallel sources of truth.

## 1. Permanent authority rule

KFE follows:

> ONE RESPONSIBILITY → ONE OWNER → ONE AUTHORITATIVE SOURCE → ONE IMPLEMENTATION PATH

This document is an index, not a replacement for the domain authorities listed below. It does not redefine business rules, formulas, data fields, UI behavior, lifecycle transitions, or release gates.

When two documents appear to define the same responsibility, the authority listed here wins. Supporting, phase, freeze, audit, traceability, defect, and evidence documents may explain or prove an authority but may not override it.

## 2. Canonical human-readable authorities

| Responsibility | Sole authority | Boundary |
|---|---|---|
| Governance / authority map | KFE-AUTHORITY-MAP.md | This index only |
| Business meaning and business rules | KFE_BUSINESS_RULES_REGISTER.md | Rule meaning, invariants, business semantics |
| Arithmetic and formulas | docs/KFE-CALCULATION-SPECIFICATION.md | Formula mechanics; subordinate to business meaning |
| Architecture / ownership / layer boundaries | docs/KFE-ARCHITECTURE-CONTRACT.md | Responsibility and implementation boundaries |
| Canonical domain/data model | docs/KFE-CANONICAL-DATA-CONTRACT.md | Entities, fields, relationships, source-of-truth data |
| Operational lifecycle/state machine | docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md | Shift/trip/cancellation/reconciliation transitions across surfaces |
| PWA UI / shell / presentation boundary | docs/UI-UX-SHELL-CONTRACT.md | Visual and presentation architecture |
| Work cockpit presentation | KFE_WORK_COCKPIT_BASELINE.md | Work-specific presentation of the canonical lifecycle |
| Universal form architecture | docs/KFE-UNIVERSAL-FORM-STANDARD.md | Form interaction/viewport/resilience |
| Action recovery semantics | docs/KFE-UNIVERSAL-FORM-ACTION-RECOVERY-RULES-FROZEN.md | Cancel/commit/undo/correction/recovery |
| Launch sequencing | KFE_LAUNCH_MASTER_PLAN.md | Phase order and launch gates |
| Android release acceptance | KFE_ANDROID_RELEASE_GATE.md | Exact APK/release acceptance |
| Android native GPS capability | docs/ANDROID-NATIVE-GPS-CONTRACT.md | Native collection/import capability; lifecycle meaning comes from operational lifecycle |

## 3. Supporting documents — not competing authorities

### Business / calculation evidence
- docs/KFE-BUSINESS-RULES-AUDIT-EVIDENCE.md — consolidated business-rule audit, re-audit, and defect evidence.
- docs/CALCULATION-AUTHORITY-MATRIX.md — calculation traceability/evidence.
- docs/DRIVER-TARGET-AUTHORITATIVE-AUDIT-2026-09-16.md — Driver Target audit/evidence.
- docs/DRIVER-TARGET-IMPLEMENTATION-BOUNDARY.md — Driver Target implementation boundary.
- docs/DRIVER-TARGET-STABILIZATION-REGRESSION.md — regression/evidence.
- docs/OPERATING-KM-FORECAST.md — operating-KM forecast implementation/reference.
- docs/PROFIT_TARGET_RECOVERY_AUDIT.md — profit/target/recovery audit.
- docs/KFE-FINANCE-FREEZE-2026-09-17.md — frozen finance implementation supplement.
- docs/KFE-PHASE-5-CALCULATION-EVIDENCE.md — consolidated calculation integration and traceability evidence.

### Data / persistence / operational evidence
- docs/KFE-PHASE-2-PERSISTENCE-CONTRACT.md — persistence implementation/evidence under canonical data contract.
- docs/KFE-PHASE-3-RIDE-CAPTURE-CONTRACT.md — ingestion adapter implementation/evidence under canonical Trip data.
- docs/KFE-PHASE-4-OPERATIONAL-RECORDS-CONTRACT.md — operational reconstruction/evidence under canonical data + lifecycle.
- KFE_DATA_RECOVERY_GATE_PHASE7.md — recovery gate/evidence.
- KFE_OPERATIONAL_AUDIT_PHASE4.md — operational audit/evidence.
- KFE_OPERATIONAL_REAUDIT_PHASE6.md — operational re-audit/evidence.
- KFE_PHASE4_AUTOMATED_AUDIT.md — automated audit/evidence.
- KFE_PHASE4_STATE_FORM_GATE_AUDIT.md — state/form audit/evidence.
- docs/PRELAUNCH-SOURCE-RECONCILIATION-2026-10-02.md — reconciliation evidence.

### UI / interaction evidence
- docs/KFE-PWA-VISUAL-APPLICATION.md — presentation implementation/reference.
- docs/PERFORMANCE-FOUNDATION.md — Performance presentation foundation.
- docs/TIMELINE-FOUNDATION.md — Timeline presentation foundation.
- docs/KFE-PHASE-4-RUNTIME-VISUAL-VERIFICATION.md — runtime visual evidence.
- docs/KFE-UNIVERSAL-FORM-STANDARD.md and docs/KFE-UNIVERSAL-FORM-ACTION-RECOVERY-RULES-FROZEN.md remain canonical within their distinct boundaries; they do not compete with the shell contract.

### Android / security / deployment evidence
- KFE_SECURITY_PERMISSIONS_GATE_PHASE8.md — security/permissions gate evidence.
- KFE_PRODUCTION_CONFIGURATION_GATE_PHASE9.md — production configuration gate evidence.
- KFE_RELEASE_CANDIDATE_PHASE10.md — release-candidate gate evidence.
- KFE_CONTROLLED_PILOT_GATE_PHASE11.md — controlled-pilot gate evidence.
- docs/KFE-RIDE-NOTIFICATION-CAPABILITY-FUTURE.md — future capability boundary.
- docs/FOUNDATION-SECURITY-PERFORMANCE.md — foundation constraints/reference.
- docs/LOCAL-HTTPS.md — development infrastructure reference.

### Governance / process / phase evidence
- .github/CI-GOVERNANCE.md — CI governance.
- AGENTS.md — agent/development instructions.
- KFE_WORKING_RULES.md — development governance; it does not redefine domain authorities.
- KFE_LAUNCH_STATUS.md — current phase/status evidence.
- KFE_LAUNCH_BACKLOG.md — backlog.
- KFE_PR_MERGE_DISCIPLINE.md — merge process.
- docs/KFE-EFFICIENT-PHASE-EXECUTION-PROTOCOL.md — execution process.
- docs/KFE-HOLISTIC-CI-FAILURE-PROTOCOL.md — CI failure process.
- docs/PRE-CI-HOLISTIC-AUDIT.md — pre-CI audit evidence.
- spec/KFE-SPECIFICATION.md — top-level product index; it points to the canonical authorities and must not duplicate their rules.

## 4. Phase freeze documents

The following are historical/frozen phase evidence and are not independent authorities:

- docs/KFE-PHASE-1-FREEZE.md
- docs/KFE-PHASE-2-FREEZE.md
- docs/KFE-PHASE-3-FREEZE.md
- docs/KFE-PHASE-4-FREEZE.md
- docs/KFE-PHASE-6-FREEZE.md
- docs/KFE-PHASE-7-FREEZE.md
- docs/KFE-PHASE-8-FREEZE.md
- docs/KFE-PHASE-9-FREEZE.md
- docs/KFE-PHASE-10-FREEZE.md
- docs/KFE-PHASE-10-RELEASE.md

If a phase freeze contains a substantive rule that is still active, that rule must be represented in the appropriate canonical authority. The freeze remains as evidence/history.


## 6. Conflict rule

If any supporting document conflicts with a canonical authority:
1. Treat the canonical authority as the intended current rule.
2. Correct the supporting document if it is describing current behavior.
3. If it is historical evidence, retain the historical statement but label it as historical/evidence and do not use it as a current rule.
4. Do not create a third document to resolve the conflict.

## 7. Future-document rule

A new document must declare one of:
- CANONICAL AUTHORITY — only if it owns a responsibility not already owned here;
- SUPPORTING — implementation supplement subordinate to a named authority;
- EVIDENCE / AUDIT — records verification/history and cannot redefine the authority.

Creating a second canonical document for an existing responsibility is prohibited.

## 8. Change-control rule

A permanent rule change must update:

Authority Map → affected canonical authority → contract/test/golden evidence → implementation

No phase note, audit, freeze, UI document, or implementation comment may silently become a new source of truth.