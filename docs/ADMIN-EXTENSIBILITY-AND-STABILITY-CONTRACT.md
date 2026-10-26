# Admin Extensibility and Stability Contract

**Status:** Supporting architectural contract  
**Scope:** KFE Admin navigation, feature workflows, forms, calculations, and presentation  
**Purpose:** Allow Admin to grow over time without destabilising existing, working features.

This document records engineering constraints for extending Admin. It does not claim that the current code already satisfies them; implementation must begin with an audit and demonstrate compliance with tests.

## 1. Authority and reconciliation

This is a supporting contract, not a new source of business or roadmap authority.

Resolve requirements in accordance with the repository's existing authority structure:

1. **KFE_BUSINESS_RULES_REGISTER.md** is the sole authority for business meaning and business-rule definitions.
2. **docs/KFE-CANONICAL-DATA-CONTRACT.md** governs canonical identity, data semantics, and persistence boundaries.
3. **docs/ADMIN-REBUILD-FROZEN-INVENTORY.md** governs the approved Admin inventory, fields, and scope. Its current approved navigation amendment is recorded alongside the inventory.
4. **docs/KFE-UNIVERSAL-FORM-ACTION-RECOVERY-RULES-FROZEN.md** governs cancel, commit, Undo, correction, draft recovery, and destructive-action safety.
5. **docs/KFE-UNIVERSAL-FORM-STANDARD.md** governs shared form mechanics and Admin form implementation.
6. **docs/UI-PRESENTATION-CHANGE-CONTRACT.md** governs presentation-only changes and separation from business behaviour.
7. **KFE_LAUNCH_MASTER_PLAN.md** alone defines the launch phase sequence and gates; **KFE_WORKING_RULES.md** governs execution and deviations.

This contract adds no independent business rules, changes no canonical schema, and does not reorder the launch roadmap. If a conflict is found, stop, identify the conflicting authorities, and resolve it explicitly before implementation. Do not silently weaken a frozen or authoritative contract.

## 2. Admin stability principle

**An additive change to one Admin feature must not silently change another feature's behaviour, data, calculations, navigation, or save/recovery process.**

Existing working Admin features are protected by default. A change to a shared component or shell is higher-risk because it can affect many features and must be reviewed and tested accordingly.

The approved visible navigation is:

- **Business Setup:** Business Setup, Vehicle, Driver
- **Vehicle Records:** Compliance, Maintenance
- **Finance:** Loan; loan payments/EMIs, prepayments, repayment history, and repayment schedule belong within the loan workspace
- **Settings:** Backup & Restore, Application Settings, Data Reset

Ledger is not a visible Admin menu item. Payments and prepayments are not separate top-level menu items. Maintenance and Compliance settlements are started from their relevant parent records. This is a navigation decision only: hiding an entry must not delete its underlying records, domain logic, historical data, or authoritative calculation paths.

The frozen inventory remains the place to record approved navigation/scope changes. This contract must not be used to introduce unapproved menu items or workflows.

## 3. Required separation of responsibilities

Verify the actual component and dependency graph before refactoring; do not assume the repository is already fully decoupled.

### 3.1 Admin shell and navigation

The shell owns shared layout, navigation presentation, responsive structure, and common page chrome. It must not own individual feature business rules, feature-specific calculations, or authoritative form/persistence state.

A shell/header/menu redesign must not change the operation triggered by an existing action, its commit timing, or the feature's data ownership.

### 3.2 Feature modules and workflows

Each feature owns its business meaning, field definitions, feature-specific validation requirements, use-case orchestration, and feature-specific tests. Examples include Loan, Maintenance, and Compliance.

Feature workflows should be independently understandable and testable. A change to Loan should not require edits to Compliance or Maintenance unless a traced, documented dependency genuinely requires it.

### 3.3 Shared form infrastructure

Shared form components own reusable mechanics such as field rendering, labels, validation presentation, dirty-state tracking, draft lifecycle, focus/accessibility, submit locking, pending/error/success states, and guarded cancellation.

Shared components must not import individual Admin feature modules, decide whether a specific business record is valid, calculate feature-specific financial values, or select feature-specific domain commands implicitly.

Reuse the existing universal form and recovery contracts. Do not introduce a second form state authority, validation path, persistence path, or draft mechanism.

### 3.4 Application, domain, and persistence

Maintain directional dependencies:

**Presentation → feature view model/application command → authoritative domain validation and calculation → repository/canonical persistence → authoritative result/read model → presentation.**

- Views render results and submit user intent; they do not write directly to IndexedDB, browser storage, native storage, or repositories.
- Business validation and calculations live in their authoritative application/domain paths, not in UI components.
- Canonical IDs and existing record identity must be preserved.
- Read models and summaries are consumers, not competing sources of truth.
- PWA and native overlay continue to share the canonical offline data boundary and retain their existing operational ownership. An Admin change must not modify shift/trip ownership or introduce an alternate write path.

## 4. Rules for safe extension

### 4.1 Add sections and menu entries

- Add a new section or item only after its product scope is approved and recorded in the frozen Admin inventory.
- Give each item a stable semantic key that is independent of its displayed title, icon, order, and styling.
- Keep menu metadata separate from feature workflow implementation where the existing architecture supports that separation.
- Route each item to one clear feature entry point; avoid duplicated routes or parallel screens for the same workflow.
- Do not introduce a generic plugin/registry framework merely to make the menu appear extensible. Add abstraction only when the code audit demonstrates reduced coupling and tests prove its value.
- Removing an item from navigation does not authorize deletion of its feature, records, service, or calculation engine.

### 4.2 Add or change headers and presentation

Presentation-only changes may alter headings, labels, icons, typography, spacing, colours, layout, grouping, and responsive behaviour.

They must not silently change field keys, canonical identifiers, defaults, validation, calculations, command selection, save timing, persistence, draft recovery, or destructive-action semantics. If a requested visual change requires a behaviour or data-contract change, separate it into an explicitly reviewed change.

### 4.3 Add calculations

- First identify the existing authoritative calculation path and its callers.
- Put business calculations in the appropriate domain/application service, not in the view or generic form component.
- Define inputs, units, precision/rounding, boundary conditions, and missing-data behaviour before treating a calculation as authoritative.
- Add calculation tests independently of the UI, then integration tests proving that the UI displays the authoritative result.
- Do not add extra calculations, dashboards, forecasts, or derived fields simply because the presentation could display them. They require explicit product approval and must not conflict with the business-rules register.
- A presentation redesign must not change a calculation's source data, formula, period semantics, units, rounding, or missing-data meaning.

### 4.4 Change fields or data contracts

- Preserve established field keys, canonical record IDs, and fields not owned by the current form.
- Treat field additions, removals, renames, defaults, and schema changes as contract changes, not styling.
- A field hidden or removed from a form must not silently erase persisted data or alter downstream consumers.
- Review changes against the frozen inventory, canonical data contract, business-rules register, and save-path matrix.
- Use a governed migration only if a real data-contract change requires one; absence of current user records is not permission to bypass architecture or recovery rules.

## 5. Form lifecycle and recovery remain mandatory

Every new or changed Admin form must follow the universal form and action recovery contracts:

1. Resolve create/edit/action mode and load canonical records and reference options through the established application path.
2. Maintain one clear form state and a stable parent-scoped draft identity.
3. Validate at the UI boundary for useful feedback and again through the authoritative application/domain path.
4. Commit through the intended command with appropriate duplicate-submit/idempotency handling.
5. Distinguish confirmed success, confirmed failure, and uncertain outcomes.
6. Show success only after confirmed durable commitment and refresh from the authoritative result/read model.
7. Preserve useful input and the draft after validation or save failure.
8. Cancel, close, back, and navigation must not commit. Clear a draft only after successful commitment or explicit confirmed discard.
9. Destructive reset and restore must retain their explicit confirmation and recovery safeguards.

This contract does not redefine Undo, correction, settlement, loan-payment, prepayment, reset, or restore semantics. Their governing contracts and authoritative domain paths remain in force.

## 6. Isolation and regression requirements

For every Admin change, identify both the intended feature and the shared boundaries it touches. Tests must cover the changed feature and any shared contract that could regress.

### Required review checklist

- [ ] Only the approved feature scope and necessary shared files changed.
- [ ] Existing routes and unrelated Admin workflows remain reachable.
- [ ] Stable menu keys, field keys, canonical IDs, and record identity are preserved.
- [ ] No business rule or calculation was moved into presentation code.
- [ ] No direct persistence access or competing source of truth was introduced.
- [ ] Cancel, draft recovery, durable-save acknowledgement, error handling, and destructive confirmation remain correct.
- [ ] Related records use canonical IDs and are revalidated at commit time.
- [ ] Presentation-only changes leave domain outputs and persisted records unchanged.
- [ ] Feature-specific tests and applicable shared form, recovery, persistence, business-rule, and UI-isolation contracts pass.
- [ ] Production build and required CI gates pass; failures are investigated rather than hidden by weakening authoritative tests.
- [ ] Physical-device verification is reported separately and is never claimed from CI alone.

A passing component test is not proof of end-to-end persistence. State exactly which tests ran and what they establish.

## 7. Required change workflow

Before changing an existing Admin feature or adding a new one:

1. Audit the active route and mounted component graph.
2. Trace the feature's form definition, application command, domain rules/calculation, repository, canonical record, and downstream consumers.
3. Check this contract and all applicable authoritative/frozen documents.
4. State the intended scope and list the files/contracts expected to change.
5. Separate presentation-only work from any business, calculation, workflow, or data-contract change.
6. Implement the smallest coherent change; avoid unrelated refactors.
7. Add focused tests for the new behaviour and regression tests for the existing contracts at risk.
8. Run required checks and inspect the actual diff for unintended cross-feature changes.
9. Resolve documentation conflicts explicitly and update the appropriate authority document through the repository's governance process.
10. Merge only when the required gates pass and the change has been reviewed.

## Success criterion

Admin can grow by adding approved sections, workflows, calculations, and presentation changes without requiring a rewrite of the existing menu or unrelated features. Shared mechanics remain reusable, feature behaviour remains independently owned, canonical data remains authoritative, and regression tests provide evidence that stable working content has not been disturbed.
