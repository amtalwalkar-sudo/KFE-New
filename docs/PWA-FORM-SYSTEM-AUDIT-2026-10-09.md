# KFE PWA-wide Form System Audit

**Audit date:** 2026-10-09  
**Audited baseline:** `main` at `07ec2ebefdb8a37096dadf278f458eab26abd807`  
**Scope:** Form inventory, input-to-persistence traces, shared keyboard/viewport behavior, validation/recovery, runtime-test coverage, and consolidated findings.  
**Audit-only change:** This report documents findings; it does not change application behavior or business rules.

## Executive finding

The forms are not all broken for the same reason. KFE has one shared global input/viewport handler, but multiple form implementations and different save patterns. The strongest shared root-cause candidates are in the global viewport handler: it subtracts the keyboard inset twice when `visualViewport` is available, and it schedules delayed scroll operations for a field without checking whether that field is still focused. These are confirmed source defects that can plausibly explain over-scrolling and focus/scroll jumps; reproducing the symptoms on a physical Android device remains necessary.

A second confirmed UX inconsistency exists in Work's numeric keypad: the same **DONE** action submits for only a hard-coded subset of fields and merely dismisses the keypad for others. Admin forms also support inline field errors in the component API but active callers do not pass validation errors back into the form, so validation feedback is not field-specific.

Latest observed CI on the audited `main` SHA is green, including the production build, contract gates, headless runtime smoke, deployed route/refresh smoke, and Android APK smoke gate. That does not prove real Android keyboard/focus behavior or every form's invalid-save/retry flow: the existing browser runtime smoke does not type through and submit each active form.

## Step 1 — Inventory active form surfaces

| Surface | Active implementation | Entry / commit path | Notes |
|---|---|---|---|
| Work: Start Shift, fare, cancellation, fuel, End Shift stages | `src/components/work/WorkContextForm.vue`, driven by `src/views/WorkModuleView.vue` | Work view → shift-trip store / WorkService → canonical repositories | Native form elements plus a Work-local custom numeric keypad. The visible forms are state-specific. |
| Admin source records | `src/components/admin/AdminSourceForm.vue` | `AdminView.vue` → `AdminService.save` → `AdminRepository` | Shared by create/edit and multiple special admin workflows. |
| Calculations inputs | `AdminSourceForm.vue` | `CalculationsView.vue` → `AdminService.save` or `CalculationsService.recordFuelBaseline` | Fuel baseline has its own validation and preview. |
| First-run setup | `AdminSourceForm.vue` for record steps; separate cloud-backup controls | `FirstRunSetupView.vue` → AdminService and FirstRunSetupService / backup services | Wizard step state and source-record save are separate commits. |
| Shift reconciliation modal | `ShiftReconciliationModal.vue` | Its own legacy store (`workCycle`) | Not imported by the current `WorkModuleView.vue`; treat as legacy until a route/import is found. |
| Generic form shell and record form | `KfeFormShell.vue`, `KfeFormField.vue`, `KfeFormActions.vue`, `AuthoritativeRecordFormRole.vue`, `FormLayout.vue` | No import from the current routed views inspected | Legacy/parallel implementation, not proven active in the main user journey. |
| Standalone fuel modal/wrapper | `CngFuelModal.vue`, `FuelForm.vue` | Current Work view uses the inline Work form instead; no active routed import found | Legacy/dormant. `FuelForm.vue` imports `./FuelEntryForm.vue`, which is absent from the repository tree; importing this wrapper would fail module resolution. This is not currently established as a production failure because it is not in the active route import graph. |

**Inventory conclusion:** Admin, Calculations, and first-run setup share the same Admin form component; Work uses a separate form/keypad implementation. Several older form implementations remain in the source tree and make the architecture harder to reason about.

## Step 2 — Trace input → validation → persistence → downstream use

### Work operational forms

- Start Shift: Work form action → `store.startShift` → WorkService → canonical shift repository.
- Fare / skip: Work form action → `saveFare` or `skipTripDetails` → shift-trip store → canonical trip repository. Fare details are optional and skipping is explicitly persisted.
- Cancellation: Work form action → `saveCancel` → shift-trip store → canonical trip repository.
- Fuel: Work form action → fuel validation/quantity calculation → `WorkService.recordFuel` → fuel repository.
- End Shift: state-dependent form action → close/reconcile/review/confirm stages → shift store and `endShift` service → canonical shift repository.
- Existing integrity contracts assert these source-level connections and mutation/audit coupling.

**Risk:** the Work view has several state-specific paths and a separate numeric keypad. Validation is mostly handled in the view/store/service path rather than a shared field-validation layer, so each path needs direct behavioral coverage.

### Admin source records

- Inputs are read from native DOM controls by `AdminSourceForm.collect()`.
- Submit emits the collected values to the parent.
- `AdminService.save` normalizes and validates against `adminFormDefinitions.js`, then calls `AdminRepository.save`.
- Repository contracts assert canonical storage plus pending mutation/audit history.
- The same form is used by Admin, Calculations, and first-run setup, but parents differ in how they track field changes and handle save errors.

**Confirmed feedback gap:** `AdminSourceForm` accepts an `errors` prop and renders field-level errors, but the active Admin/Calculations/first-run usages inspected do not pass validation errors into that prop. Failures are caught at the parent and typically rendered as a page-level message. Validation still runs in the application service; the gap is error localization and recovery usability, not absence of server/application validation.

### Calculations and setup

- Standard calculation inputs save through `AdminService.save`.
- Fuel baseline uses explicit finite/non-negative checks and then `CalculationsService.recordFuelBaseline`.
- First-run record steps save the source record, then separately update setup-step state.
- Cloud backup setup uses its own configuration, schedule registration, and first-backup verification path.

**Risk:** these workflows have more than one state transition. Tests should verify what happens if the source save succeeds but the subsequent setup-state update fails, and if cloud backup configuration succeeds but the first backup cannot be verified.

## Step 3 — Shared keyboard, focus, and viewport review

File: `src/presentation/forms/universalFormSystem.js`.

### Finding F-01 — Keyboard inset is subtracted twice

**Status:** Confirmed source defect; physical-device symptom not independently reproduced in this audit.  
**Mechanism:** `viewportBottom` is already computed as `visualViewport.height + visualViewport.offsetTop`, which is the visible viewport's bottom edge. The code then subtracts `--kfe-keyboard-inset` again when computing `safeBottom`. When the system keyboard is open, this double-counts the keyboard height and can mark otherwise visible controls as below the safe area, provoking unnecessary `scrollIntoView` calls.

**Expected correction:** when `visualViewport` is available, calculate safe bounds from that visible viewport once; only use the keyboard inset to adjust a layout whose viewport measurement does not already exclude the keyboard.

### Finding F-02 — Delayed scroll callbacks can act on stale focus

**Status:** Confirmed source defect; physical-device symptom not independently reproduced in this audit.  
**Mechanism:** every focus schedules a `requestAnimationFrame`, a 60 ms timer, and a 220 ms timer. Those callbacks are not cancelled and do not verify `document.activeElement === el` before scrolling. If focus moves quickly, a callback for an old field can scroll it into view after the user has moved to a new field.

**Expected correction:** coalesce/cancel pending focus work and re-check that the same control is still active before measuring or scrolling.

### Finding F-03 — Work keypad's DONE behavior is inconsistent

**Status:** Confirmed source behavior; severity depends on the user's intended DONE semantics.  
**Mechanism:** `WorkContextForm.numericPress('DONE')` always dismisses the keypad, but submits only when the active field is one of `trip-parking`, `cancel-fare`, `fuel-amount`, or `shift-revenue`. For other fields (including fare and toll), DONE only hides the keypad. `NEXT` is also defined for only a subset of fields. This is not a consistent form-level Next/Done contract.

**Expected correction:** define navigation and completion per form/state, then make DONE either advance to the next required field or submit the form when the workflow is ready. Optional fields must not trap users or imply a save that did not occur.

### Finding F-04 — Input architecture is split

**Status:** Confirmed architecture drift against the universal form standard.  
**Mechanism:** the universal handler governs viewport hints and Enter handling globally, while Work implements its own numeric keypad state and field-to-field map. Admin relies on native controls and DOM collection. This makes the same keyboard interaction mean different things across form families.

**Expected correction:** retain domain-specific layouts and business rules, but centralize shared focus/viewport and keyboard-navigation behavior, with explicit exceptions for Work's custom keypad.

## Step 4 — Validation and recovery review

### What is already present

- Admin application-service validation normalizes input, rejects unknown keys, checks required values, finite numbers, bounds, dates, select values, and several cross-field business rules before persistence.
- Work paths have explicit validation for odometer confirmation/gap allocation, non-negative fare/toll/parking, cancellation reason/fee, fuel values, and end-shift readiness.
- The universal action/recovery contract correctly states that Cancel must not mutate authoritative state, commit failures must not display false success, and downstream history should be corrected rather than silently erased.

### Findings

**F-05 — Field-level validation feedback is disconnected in active Admin forms.** The form can display per-field errors, but active callers don't bind a validation-error map to `errors`. This makes failed saves harder to diagnose and repeat correctly.

**F-06 — Cross-step recovery needs explicit failure-path tests.** First-run record save and setup-step completion are separate operations. Test both possible failure boundaries, ensuring that a saved source record is not duplicated when a user retries after a setup-state failure.

**F-07 — Custom Admin save buttons create multiple interaction paths.** Some special workflows hide the form's built-in actions and provide a separate page-level button (for example target/rate/payment/prepayment workflows). These paths should be tested with button taps and Enter/Done separately so that keyboard submission and the visible action perform the same validated command exactly once.

**F-08 — Legacy form implementations remain.** The generic shell/action components and standalone fuel wrappers are not proven active in the current routed journey. The absent `FuelEntryForm.vue` target is a dormant broken import. Remove or repair legacy implementations only after confirming no external/dynamic import depends on them; do not treat them as active runtime causes without that evidence.

## Step 5 — Runtime verification and its limits

The latest observed `main` workflow run was successful:

- Workflow run: [37865642206](https://github.com/amtalwalkar-sudo/KFE-New/actions/runs/37865642206)
- Commit: `07ec2ebefdb8a37096dadf278f458eab26abd807`
- PWA build and contract gates: success.
- Headless Playwright runtime smoke: success.
- Deployed SPA route/refresh verification: success.
- Android APK smoke gate: success.

The current `phase4-runtime-visual-smoke.mjs` covers visible Work/Timeline/Performance/Admin routes, a persisted canonical fixture, GPS control, theme switching, accessibility labels, viewport widths, and repository isolation. The deployed runtime smoke checks direct routes and hard refreshes.

**Not covered by those smoke scripts:** realistic Android soft-keyboard resizing, rapid focus changes while typing, the Work keypad's DONE behavior across all field types, invalid Admin field feedback, repeated Save taps, interrupted form submission, and retry after a partial first-run flow. The green run therefore establishes baseline build and route health, not complete form usability.

## Step 6 — Consolidated defect register and recommended order

| ID | Priority | Finding | Confidence | Next verification/fix |
|---|---|---|---|---|
| F-01 | P1 | Keyboard inset double-subtracted from visible viewport | Confirmed source defect | Correct safe-bound calculation; test with keyboard open/closed on Android and Chromium. |
| F-02 | P1 | Delayed scroll callbacks can scroll a no-longer-focused field | Confirmed source defect | Cancel/coalesce callbacks and check active element; rapid-focus regression test. |
| F-03 | P1 | Work keypad DONE submits only for hard-coded fields | Confirmed source behavior | Form-state navigation matrix for start/fare/cancel/fuel/end/reconciliation. |
| F-04 | P1 | Shared input handling and Work keypad behavior are split | Confirmed architecture drift | Unify shared navigation/viewport contract without moving business logic into presentation code. |
| F-05 | P2 | Active Admin callers don't pass field errors back to the form | Confirmed wiring gap | Return validation map to field component and focus first invalid field. |
| F-06 | P2 | First-run source-save/setup-state partial failure lacks demonstrated recovery test | Coverage gap, not proven production failure | Simulate failure between commits and verify retry does not duplicate source records. |
| F-07 | P2 | Special Admin flows have alternate submit controls | Confirmed implementation pattern; duplicate execution not proven | Test keyboard and tap submission exactly once per workflow. |
| F-08 | P3 | Dormant legacy form files, including a broken FuelForm import target | Confirmed repository hygiene issue; not shown active | Verify import graph, then remove or repair dead code deliberately. |

### Regression matrix required before declaring the form system fixed

1. Admin create and edit: required-field failure, invalid number/date, select relationship, conditional vehicle sale fields, correction and retry.
2. Calculations: save each ordinary input and fuel baseline; verify calculated output refresh and no duplicate source record.
3. First-run setup: save, skip, back/forward if supported, reload, and failure between source save and step-state save.
4. Work: Start Shift gap gate, fare save/skip, cancellation validation, fuel validation/partial fill, each End Shift stage, and reconciliation recovery.
5. Keyboard: first/middle/final field, Next/Done, decimal keypad, rapid focus changes, keyboard open/closed, small viewport, shell navigation visible.
6. Recovery: Cancel without mutation, repeated Save tap, save rejection, reload while dirty, and retry after a failed commit.
7. Run the full CI contract suite and deployed runtime route/refresh checks; separately run interactive Android tests for keyboard and focus behavior.

## Scope boundary

This audit did not change form code or business calculations. The findings above separate confirmed source defects from runtime symptoms that still require a device-level reproduction. The next implementation pass should fix F-01 and F-02 first because they are shared infrastructure defects, then standardize Work's DONE contract and wire Admin field errors, followed by regression tests for the cross-step recovery and alternate submit paths.
