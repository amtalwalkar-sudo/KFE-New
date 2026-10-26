# KFE 2.0 — Universal Form Standards

**Status:** Living architectural contract  
**Scope:** All KFE PWA business forms and interactive form controls, including driver-facing Work forms and Admin master-data, configuration, and financial record forms
**Authority:** This document is the editable source of truth for KFE form architecture, resilience, recovery, and UI standards.

## 1. Permanent hierarchy

All business forms follow this hierarchy:

**Universal Form Architecture → Universal Form Resilience → Universal Form Action & Recovery Rules → Business Form**

Universal does **not** mean every form must look or behave identically. The hierarchy is mandatory; presentation and workflow may vary through explicit, justified exceptions.

---

## 2. HARD RULES — MUST

These rules are non-negotiable unless the underlying architecture is intentionally revised.

### Zero obscuration and reachability

- No active `<form>`, input, interactive control, or submission/cancellation action may become hidden, clipped, covered, or physically unreachable.
- Shell headers, bottom navigation, FABs, notifications, drawers, overlays, and other persistent chrome must never obscure active form content.
- Input surfaces must not permanently cover the active field or required action.
- Conditional fields may appear or disappear according to business logic, but whenever a control is active it must remain reachable.
- Parent containers must not use fixed heights or unsafe overflow behavior that clips active form content.
- Safe-area insets and dynamic viewport behavior must be respected.

### Resilience

- Focused controls must be brought into a usable viewport position when necessary.
- Shared input-surface/visual-viewport handling must be reused; forms must not create competing viewport systems. KFE numeric Work forms use the shared form-owned intelligent numpad.
- Native constraint validation and business/domain validation must remain compatible.
- Accessibility and usable focus behavior must not be intentionally broken by visual customization.

### Mistake and recovery

- The **Universal Form Action & Recovery Rules** contract remains authoritative for Cancel, Undo, correction, reversal, confirmation, and authoritative domain state.
- UI layers must not invent competing deletion/reversal semantics.
- Unsaved draft restoration must never silently create an authoritative domain mutation.
- Draft recovery is mandatory and parent-scoped: uncommitted values survive application restart, failed saves preserve them, and drafts are cleared only after successful commitment or explicit confirmed discard.
- Draft persistence remains non-authoritative and separate from canonical business records and pending mutation recovery; restoration never commits or replays a mutation.

### Architecture

- Business forms consume the universal form layer rather than duplicating shared form behavior.
- Business/domain rules remain outside the visual form framework.
- Existing reusable infrastructure must be reused instead of replaced with screen-specific equivalents.
- Explicit exceptions must be identifiable and documented.
- `src/presentation/shell/shell-contract.js` is outside this form standard and must remain untouched unless explicitly requested by the user.

---

## 3. GENERAL RULES — SHOULD

These are the default KFE form architecture and modern app UI patterns. They may be overridden by a legitimate exception or a better domain-specific workflow.

### Canonical composition

**Form → Section/Card → Field → Visual Control → Input → Validation → Completion**

Each layer has a clear responsibility:

- **Form:** overall layout, draft state, keyboard/viewport behavior, safe-area clearance, submission/cancellation, and recovery integration.
- **Section/Card:** grouping, hierarchy, elevation, progressive disclosure, and logical workflow boundaries.
- **Field:** label, supporting text, required state, context icon, auto-filled state, and field-level presentation.
- **Visual Control:** tiles, segmented controls, switches, selection cards, and other tactile controls.
- **Input:** text, number, date, time, and other native input mechanisms with appropriate semantics.
- **Validation:** synchronous/debounced validation, accessible errors, invalid state, and field feedback.
- **Completion:** valid-state indication, completion feedback, and clear readiness to continue/save.

### Modern layout

- Prefer card-based grouping for related information.
- Use rounded cards and subtle elevation consistent with the KFE visual system.
- Prefer single-column mobile layouts where they improve readability and touch accuracy.
- Use progressive disclosure when it reduces cognitive load without making routine workflows unnecessarily slow.
- Avoid dumping large dense field lists into a single undifferentiated surface.

### Visual controls

- Prefer visual selection tiles/cards over generic `<select>` or raw radio controls when the option set is small and visual selection improves speed or comprehension.
- Prefer switches, segmented controls, or visual toggle pills over raw checkboxes for binary choices where appropriate.
- Preserve native semantics underneath custom controls where possible.
- Specialized controls are encouraged when they materially improve the business workflow.

### Input styling

- Prefer embedded or floating labels where they preserve clarity and save space.
- Use meaningful context icons when they improve recognition; icons must not replace accessible labels.
- Use a clear accent/focus ring rather than relying on default browser borders.
- Keep input targets tactile and comfortable; the normal shared minimum is 52px.

### Micro-interactions

- Valid completion may receive a subtle checkmark, border transition, or spring-style confirmation.
- Invalid states should be immediately understandable and accessible.
- Skeleton/loading states should be used when data is genuinely being fetched or resolved asynchronously, not as decoration.
- Auto-filled values may receive a distinct subtle visual state so users can recognize pre-populated data.
- Respect reduced-motion preferences.

---

## 4. GUIDELINES — RECOMMENDED / EDITABLE

These are design preferences, not hard requirements. They may evolve as KFE is tested in real workflows.

- Preferred card radius: approximately 16–24px.
- Preferred spacing, density, animation timing, spring behavior, and accent treatment may evolve with usability testing.
- Preferred number of inputs visible in a card is approximately 1–3 when progressive disclosure genuinely helps.
- Preferred icon placement is inside or adjacent to the input where it improves scanning.
- Preferred focus treatment may use an accent glow/ring consistent with the current KFE theme.
- Preferred completion animation should be quick and unobtrusive.
- Preferred dark driver-centric presentation should remain coherent across the application.

Guidelines are deliberately editable and must not be treated as regressions merely because a legitimate business form uses a different presentation.

---

## 5. EXCEPTIONS — ALLOWED AND EXPLICIT

Not all forms are alike. A form may intentionally depart from the general rules when its workflow requires it.

Examples include:

- **Compact:** PIN, OTP, authentication, or other very small forms.
- **Inline/header search:** search bars and filtering controls integrated into navigation or page headers.
- **Canvas/signature:** signature pads and drawing interfaces.
- **Wizard/step flow:** complex workflows where sequential steps are clearer than one long form.
- **Specialized operational controls:** odometer pickers, date/time controls, vehicle selectors, or other domain-specific tactile controls.
- **Dense operational interfaces:** workflows where experienced drivers need high information density and speed.

### Exception requirements

An exception should make clear:

1. **What is different?**
2. **Why is it different?**
3. **Which HARD RULES still apply?**

Exceptions should be declared semantically where practical, for example:

```html
<form data-form-type="compact">
```

The existing compact exception remains available for compact/auth/PIN/OTP/search-like UI. Search/header-search and canvas/signature interfaces may bypass normal layout/input rules where appropriate.

An exception changes presentation or workflow; it does not silently disable fundamental reachability, keyboard safety, accessibility, or mistake/recovery guarantees unless that exception is itself explicitly approved as an architectural change.

---

## 6. EDITING AND GOVERNANCE

This is a **living contract**, not a permanently frozen visual specification.

When a new form requirement appears:

1. Check the HARD RULES first.
2. Reuse the universal architecture and resilience layer.
3. Apply GENERAL RULES by default.
4. Use GUIDELINES as design guidance, not constraints.
5. If the workflow genuinely differs, create an explicit exception instead of weakening a universal rule for every form.
6. If a rule repeatedly needs exceptions, reconsider the rule itself and edit this contract deliberately.

When changing the contract, preserve the distinction between **MUST**, **SHOULD**, and **RECOMMENDED/EDITABLE** behavior.

---

## 7. Building rule

Before adding or changing a driver-facing form:

1. Reuse the shared form infrastructure.
2. Compose the form using the canonical hierarchy where applicable.
3. Do not create a second competing input/viewport system. The shared KFE intelligent numpad is the approved numeric input surface.
4. Do not add screen-specific bottom-clearance hacks when a shared rule can solve the issue.
5. Preserve existing business validation and domain commands.
6. Preserve the **Universal Form Action & Recovery Rules** contract.
7. Mark legitimate exceptions explicitly.
8. Verify the active form remains reachable at small viewports, with the KFE input surface open, with conditional fields present, and with shell chrome visible.

**Permanent principle:**

> One universal architecture, flexible presentation, explicit exceptions, and non-negotiable reachability and recovery.


---

## 8. Admin forms — reusable architecture and end-to-end wiring

**Purpose:** Admin contains multiple business-record and configuration forms. Build them on the universal form foundation so common interaction behavior is reused while each feature remains independently owned and testable.

This section extends the universal rules; it does not replace the frozen Admin inventory, business-rule register, canonical data contract, or Universal Form & Action Recovery Rules. If a proposed Admin change conflicts with those authorities, stop and document the conflict before implementation.

### 8.1 Scope and separation of responsibilities

- These standards apply to Admin forms as well as driver-facing forms. Admin may use its own appropriate density and interaction patterns; universal safety, accessibility, validation ownership, draft recovery, and commit semantics still apply.
- Reuse common form infrastructure for field rendering, labels/help text, validation display, dirty-state tracking, draft recovery, submit/cancel behavior, pending/error/success states, and accessible focus handling.
- Do not build one giant generic Admin component that owns every feature's business rules. Shared infrastructure handles mechanics; each Admin feature owns its field definition, domain meaning, application use case, and feature-specific tests.
- Follow the repository's actual architecture and existing interfaces. Audit current imports, handlers, services, repositories, and tests before adding abstractions; do not assume the existing implementation is already fully decoupled.
- Keep dependencies directional: **Admin UI / form components → feature view model or application command → domain validation and rules → repository/canonical persistence → authoritative result/read model → UI state**.
- Presentation components must not write directly to IndexedDB, browser storage, native storage, or repositories; calculate business values; or create a competing source of truth.
- Shared form components must not import Admin feature modules or decide whether a particular business record is valid. Business-specific rules remain in the authoritative domain/application path.
- Do not introduce a second validation or persistence path just to make a new form easier to build.

### 8.2 Stable form and field contracts

- Give each form a stable semantic identity, and scope its draft to the form, workflow step, parent entity type, and canonical parent ID where applicable.
- Keep field keys aligned with the established application/service contract. Labels and visual layout may change without silently renaming persisted keys, changing record schemas, or changing downstream meaning.
- Treat field definitions as presentation metadata and input guidance, not as the final authority for business validity. Required/range/relationship/date-order/financial rules must also be enforced in the authoritative application/domain path.
- Define each field's semantic type, label, accessible name, required state, input mode, formatting, allowed options, help text, and presentation rules explicitly where applicable.
- Use canonical IDs for relationships (for example, a selected vehicle, driver, loan, or source record); display labels are not identifiers. Load options through the established application/read-model path and handle loading, empty, unavailable, and stale-reference states.
- Keep entered facts distinct from derived values. A form must not ask users to enter values already authoritatively calculated elsewhere, nor calculate a duplicate business value in the UI.
- Preserve existing canonical record identity during edits. Do not turn an edit into delete-and-recreate or change immutable/contractual fields outside the approved correction path.
- Field additions, removals, key changes, defaults, and migrations require review against the frozen Admin inventory, canonical data contract, and downstream consumers. A UI field removal must not silently erase persisted data.

### 8.3 Validation and input behavior

- Provide immediate, understandable field-level feedback where practical, plus authoritative validation on submit. Invalid values must not reach canonical persistence merely because client-side validation was bypassed.
- Keep validation errors associated with the relevant field, accessible to assistive technology, and preserved until corrected or made irrelevant by a valid state change.
- Do not mark a field invalid before the user has had a reasonable opportunity to interact with it, unless the form is restoring a known invalid draft or is presenting a submit-time validation result.
- Parse and normalize input deliberately at the application boundary. Formatting must not change the business meaning, precision, units, sign, or currency of the entered value.
- Date fields must retain their defined date semantics and timezone/business-period rules. Do not silently convert date-only values through a timestamp or local/UTC conversion that changes the calendar date.
- Numeric fields must define their unit, permitted range, precision, and zero/blank meaning. Blank, zero, unknown, and not-applicable are distinct unless the authoritative business contract explicitly equates them.
- Selectors must represent valid choices and preserve canonical relationship IDs. A deleted, inactive, or unavailable related record must not be silently replaced with another option.
- Defaults must come from an approved form/domain definition or explicit product rule. Do not invent global financial, date, status, or rate defaults in a generic component.
- Keyboard, focus order, Enter/Next behavior, multiline entry, touch targets, safe areas, and visible action placement must remain usable on narrow Android viewports. Admin may use appropriate native input modes; do not force Work's specialized numeric numpad onto Admin unless separately approved.

### 8.4 End-to-end form lifecycle

Every Admin form must implement the same explicit lifecycle, adapted to its use case:

1. **Open:** resolve the form mode (create/edit/action), load the relevant canonical record and reference options, and establish a stable draft identity.
2. **Edit:** maintain one clear in-memory form state; do not rehydrate over user edits on every render or unrelated data refresh.
3. **Validate:** run presentation-level feedback and submit through the authoritative application/domain validation path.
4. **Commit:** dispatch one intended command with stable identity/idempotency semantics appropriate to the operation. Disable or guard duplicate submission while an outcome is unresolved.
5. **Resolve outcome:** distinguish confirmed success, confirmed failure, and uncertain outcome. Verify/reconcile an uncertain commit through the established command/recovery path before allowing a conflicting retry.
6. **Success:** show success only after confirmed durable commitment; refresh/re-read from the authoritative result/read model rather than assuming the submitted UI object is canonical.
7. **Failure:** retain useful user input and the draft, show a truthful actionable error, and keep the form recoverable. Do not silently reset fields.
8. **Cancel/close:** never commit. If there are unsaved changes, use the established Stay/Discard confirmation. Clear the draft only after successful commit or explicit confirmed discard.
9. **Reopen/restart:** restore only the matching non-authoritative draft; never replay a mutation just because a draft was restored.

A spinner, disabled button, animation, optimistic list insertion, or closed dialog is not proof of commitment. Draft persistence and canonical business persistence remain separate.

### 8.5 Shared behavior versus feature-specific behavior

The universal layer should provide reusable mechanics, not generic business meaning. Suitable shared responsibilities include:

- Form shell/layout and section composition.
- Accessible field wrappers, labels, descriptions, and error announcements.
- Input adapters and presentation-only formatting.
- Dirty-state detection and guarded navigation/cancel.
- Parent-scoped draft save/restore/clear lifecycle.
- Submit locking, pending state, confirmed outcome presentation, and retry affordances.
- Consistent loading, empty, unavailable, validation-error, commit-error, and success states.
- Reference-option loading state and stale-reference presentation.
- Keyboard/viewport/safe-area coordination and focus management where shared infrastructure supports it.

Feature-owned responsibilities include:

- Field definitions and stable field keys.
- Business meaning, cross-field rules, relationship constraints, and domain validation.
- Create/edit/action command selection and payload construction.
- Domain-specific correction, reversal, settlement, allocation, and destructive-confirmation semantics.
- Feature-specific result/read models and downstream refresh requirements.

Do not add a registry, schema engine, global form store, or abstraction layer solely for uniformity. Introduce it only where an audit demonstrates reduced coupling or duplicated behavior, and prove it with focused tests.

### 8.6 Create, edit, and record-action safety

- Distinguish create, edit, and record-action modes explicitly; their command and recovery semantics are not interchangeable.
- Edit operations preserve the existing canonical ID and all fields not owned by the current form.
- Record actions such as payment, settlement, prepayment, correction, or deletion must use their established domain command and confirmation rules, not be disguised as ordinary generic form saves.
- A related/source record selector must verify that the selected source exists and is compatible with the action at commit time, not only when options were first loaded.
- Destructive actions require explicit, specific confirmation and must follow governed soft-delete, reversal, restore, and audit behavior. Generic form components must not invent Undo or deletion semantics.
- If a command can affect reports, balances, loan schedules, compliance, or other downstream records, use the existing authoritative transaction/reconciliation path and refresh dependent read models after confirmed success.
- Preserve offline operation. Do not make routine Admin save, validation, or navigation depend on internet access unless a specific feature contract explicitly requires it.

### 8.7 Testing and acceptance gates

Test shared form mechanics separately from feature business rules, then prove representative forms end to end.

**Shared form contract tests** should cover:
- Required/range/type validation feedback and authoritative rejection of invalid payloads.
- Stable field identity and preservation of canonical record IDs during edit.
- Parent-scoped draft restoration, app restart, parent switching, and confirmed discard.
- Cancel/back/navigation never commits and unsaved changes trigger the correct guard.
- Duplicate taps, interrupted saves, lost acknowledgements, confirmed failure, and uncertain outcomes do not create duplicates or lose entered values.
- Loading, empty reference options, stale/missing related records, validation errors, save errors, and confirmed success.
- Keyboard/viewport reachability, focus order, accessible field errors, and final actions at narrow viewport sizes.
- No direct persistence access or business calculations from presentation components.

**Feature integration tests** should cover:
- Form → application command → authoritative validation → canonical persistence → returned/read-model result → visible UI state.
- Create and edit behavior, including identity preservation and fields not owned by the form.
- Relevant downstream consumers and refresh behavior.
- Offline save and reload/reopen behavior where the feature is expected to work offline.
- Regression tests for the specific Admin feature being changed, plus existing universal form, persistence, business-rule, and UI-isolation contracts.

Do not treat a component/unit test as proof of end-to-end persistence. Record which checks were automated, which CI gates passed, and whether physical-device verification was actually performed.

### 8.8 Admin implementation sequence

Before implementing a new Admin form or changing an existing one:

1. Identify the active route and actual mounted component graph.
2. Trace the current form definition, validation, command/service, repository, canonical record, and downstream consumers.
3. Check the frozen Admin inventory and authoritative business/canonical contracts.
4. State the proposed field/action scope and identify any business-rule or persistence changes separately.
5. Reuse or improve the universal form layer only where the audit demonstrates a shared need; keep the feature-specific logic decoupled.
6. Implement the full user-facing flow, including loading, validation, cancel, save, failure, retry/recovery, and post-commit refresh—not just the visual fields.
7. Add focused shared-contract and feature end-to-end regression tests.
8. Run the applicable full suite, production build, UI isolation, route/runtime, Android, and CI gates; investigate failures rather than weakening authoritative tests.
9. Review the diff for unintended changes to business rules, canonical data, shared shell, or unrelated forms.
10. Merge only when required gates pass; document physical-device verification separately.

**Admin form success criterion:** a new Admin form can reuse consistent interaction and recovery mechanics while keeping its business rules, commands, data contract, and tests isolated. Its complete user journey is wired to the authoritative offline-capable application path, and neither a presentation redesign nor shared-component change silently changes business meaning or persistence behavior.
