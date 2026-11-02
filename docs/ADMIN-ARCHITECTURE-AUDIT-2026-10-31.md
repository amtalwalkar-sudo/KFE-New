# Admin Architecture Audit — 2026-10-31

**Status:** SUPPORTING AUDIT EVIDENCE  
**Scope:** Admin menu, forms, application/repository wiring, persistence integrity, obsolete workflows, documentation and regression coverage.  
**Product boundary:** `KFE_BUSINESS_RULES_REGISTER.md` and `KFE-AUTHORITY-MAP.md`.

## Approved Admin surface

The production Admin route is `src/views/AdminView.vue`. Its navigation inventory is owned by `src/presentation/admin/adminNavigation.js` and contains exactly four categories:

1. Business Setup — Business Setup, Vehicle, Driver.
2. Vehicle Records — Compliance, Maintenance.
3. Finance — Loan.
4. Settings — Backup & Restore, Application Settings, Data Reset.

The active source-record forms are Business Setup, Vehicle, Driver, Compliance, Maintenance and Loan. There is no Ledger menu, no top-level prepayment workflow, no duplicated Settings destination list inside the Settings detail screen, and no active Admin calculation dashboard.

## Canonical wiring

```text
AdminView / AdminSourceForm
        ↓
AdminService + Admin form definitions + Admin validation
        ↓
AdminRepository
        ↓
Canonical IndexedDB stores + mutation/audit history

AdminSourceForm → FormDraftService
                  (temporary, non-authoritative draft only)

Admin Settings → BackupService / BackupFileService
                 (separate backup/restore boundary)
```

Presentation owns navigation, transient UI state and input rendering. AdminService owns Admin normalization, validation and use-case orchestration. AdminRepository owns canonical persistence transactions, relationship integrity, soft deletion, mutation records and audit history. FormDraftService does not create canonical business records.

## Findings and fixes applied in this audit

- **Removed the upward dependency from persistence to application.** AdminRepository no longer imports Admin form definitions or Admin validation.
- **Removed duplicate validation.** AdminService is the single application-layer validation owner; AdminRepository accepts the normalized application command and performs persistence/integrity work.
- **Removed retired form rules.** The shared Admin validation module now contains only general field constraints and active Vehicle, Compliance and Driver integrity rules. Retired ride, driver-target, break-even, loan-payment, prepayment and settlement rules were removed.
- **Closed the vehicle-delete integrity gap.** Driver, Compliance and Maintenance references are checked inside the same IndexedDB read/write transaction that soft-deletes a Vehicle. The application service no longer performs a separate, incomplete preflight read.
- **Prevented stale Admin reads from winning.** Admin list snapshots load together and use a generation guard so a slower previous section load cannot overwrite the currently selected section.
- **Removed the unused direct Settings read/write bypass.** Business Setup settings now use the same AdminService/AdminRepository transaction, mutation record and audit path as other Admin source forms.
- **Removed obsolete Loan calculation metadata.** The active Loan form stores source terms and displays one derived monthly EMI estimate from principal, tenure and annual interest rate. It does not persist EMI or calculate amortization or repayment schedules.
- **Corrected stale Settings and Compliance descriptions.** Application Settings is described as Dark-only appearance; Compliance describes recorded validity and cost, not retired payment workflows.
- **Updated the architecture and universal form contracts** to describe the single Admin path, ownership rules and non-authoritative draft boundary.

## Obsolete workflow and data-retention decisions

The legacy Admin calculation/dashboard components and old Admin/Loan read-model files are absent from the current PR branch and are not imported by the production Admin route. The production router exposes only Work, Timeline, Performance and Admin.

Legacy finance, target, settlement, day, odometer-gap, movement-artifact and financial-period stores are removed from schema 18 and from backup format 6. Older backup formats remain readable, but retired store payloads are deliberately discarded; only active in-scope records are restored.

No business records, existing ride records, fares, cancellation values or event timestamps were edited by this Admin audit. No destructive database migration was introduced.

## Regression coverage added

`src/tests/adminArchitectureBoundary.contract.js` verifies:
- the six approved form definitions and the single read-only EMI calculation from saved loan terms;
- no retired workflow rules in the Admin validator;
- application-only form validation and no repository dependency on application Admin modules;
- transactional relationship protection including Maintenance references;
- stale-read generation protection;
- the active Admin route and current architecture/form documentation;
- invalid calendar-date rejection and preservation of valid zero-valued source facts.

The test is registered in `src/tests/runAllContracts.js`.

## Verification status

Source changes and regression contracts are committed to PR #412. GitHub Actions must complete against the final head before this audit is called CI-verified. Physical-device verification remains separate from CI and should include Admin list/detail/form navigation, create/edit/delete protection, Android Back behavior, mobile Save/Cancel layout, backup export/restore and reset safeguards.
