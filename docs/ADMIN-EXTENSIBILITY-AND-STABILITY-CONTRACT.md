# Admin Extensibility and Stability Contract

**Status:** Supporting architecture contract — subordinate to `KFE_BUSINESS_RULES_REGISTER.md` and `docs/KFE-ARCHITECTURE-CONTRACT.md`.
**Scope:** Current Admin navigation, source forms, saved records, and settings/recovery integration.

This document governs how the current basic Admin surface is maintained without introducing a second business, calculation, persistence, or navigation authority. It does not authorize new Admin features.

## 1. Current Admin boundary

The current Admin surface consists of:
- Business Setup;
- Vehicle;
- Driver;
- Compliance;
- Maintenance;
- Loan source details;
- Settings for backup/restore, application appearance, and data reset.

The visible navigation grouping is Business Setup (Business Setup, Vehicle, Driver), Vehicle Records (Compliance, Maintenance), Finance (Loan), and Settings (Backup & Restore, Application Settings, Data Reset).

Forms store source facts. Loan terms are saved as facts only; no EMI, amortization, repayment schedule, payment allocation, prepayment or loan-payment workflow is active. Compliance and Maintenance store their recorded source facts only; no provisions, settlements or projected costs are calculated. There is no Ledger, target, break-even, diagnostics/calculations or financial dashboard workflow.

Historical records for retired workflows may remain in compatibility/recovery data where required to preserve backups. Their presence does not reactivate the former UI or calculation.

## 2. Authority order

1. `KFE_BUSINESS_RULES_REGISTER.md` owns product scope and business meaning.
2. `docs/KFE-ARCHITECTURE-CONTRACT.md` owns layer and responsibility boundaries.
3. `docs/KFE-CANONICAL-DATA-CONTRACT.md` owns canonical records, fields, relationships and preservation.
4. `docs/ADMIN-ARCHITECTURE-AUDIT-2026-10-31.md` records the current Admin implementation audit; it is evidence, not a competing authority.
5. `docs/KFE-UNIVERSAL-FORM-STANDARD.md` and `docs/KFE-UNIVERSAL-FORM-ACTION-RECOVERY-RULES-FROZEN.md` govern shared form mechanics and safe recovery.

No historical inventory or phase note can expand this scope.

## 3. Responsibility boundaries

### Admin shell and navigation
The Admin view owns navigation presentation, selected section, loading/error state and form orchestration. It does not own business validation, calculations or canonical persistence.

### Source forms
Forms own input rendering and temporary draft interaction. They store source facts only and submit through the application service. They do not calculate business results or write directly to browser/native databases.

### Application service
The Admin application service owns form normalization, authoritative application-level validation and use-case orchestration.

### Repository
The Admin repository owns canonical persistence transactions, record identity, relationship integrity, soft deletion and mutation/audit coupling. It must not import presentation or application form definitions.

### Settings and recovery
Backup, restore and reset remain in their separate persistence/recovery boundary. Destructive operations require explicit confirmation and must retain recovery safeguards.

## 4. Safe change rules

- Add no new Admin category, form, calculation or workflow without explicit product approval and an update to the business-rule register.
- Keep one route and one canonical save path per active form.
- Preserve canonical IDs, stable field keys and unrelated fields during edits.
- Removing a visible field or retired workflow must not silently delete historical records.
- Validate related-record integrity at the repository transaction boundary.
- Keep draft recovery separate from canonical business records and pending mutation recovery.
- A presentation-only change must not alter validation, defaults, save timing, persisted values or business meaning.
- Do not introduce generic plugin/registry frameworks or parallel form systems without evidence that they reduce coupling.

## 5. Form lifecycle

Every Admin form must:
1. Load canonical records and reference options through the application path.
2. Maintain one draft state with stable parent-scoped identity.
3. Provide useful field feedback while retaining authoritative application validation.
4. Commit through the single Admin application/repository path.
5. Show success only after durable commitment is confirmed.
6. Preserve useful input after validation or save failure.
7. Cancel, close, Back and navigation without committing.
8. Clear a draft only after successful commit or explicit confirmed discard.
9. Use explicit confirmation and recovery safeguards for reset/restore.

## 6. Regression evidence

Changes must verify the affected form, canonical save path, relationship integrity, draft recovery, mobile keyboard/viewport behaviour, navigation and applicable backup/recovery contracts. CI and physical-device evidence must be reported separately.

## Success criterion

The current Admin remains a straightforward set of source forms and essential settings. Its presentation can evolve without duplicating business rules, calculations, persistence, or recovery ownership. Retired financial and planning workflows remain retired.
