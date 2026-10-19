# KFE UI/UX Component-Isolation Audit

Status: **BASELINE INVENTORY COMPLETE; REFACTOR NOT YET STARTED**

This document records the initial evidence for the requirement that changing one UI/UX element must not silently change unrelated forms, button positions, keyboard behavior, component geometry, navigation or other surfaces.

## Current architecture — observed in source

| Surface | Observed implementation | Coupling risk |
|---|---|---|
| Work screen | `src/views/WorkModuleView.vue` is approximately 64 KB and combines screen rendering, reactive form state, lifecycle/action handlers, native event handling, runtime ports and read-model use. It has no component-local style block. | A small view-level edit can intersect several workflows; view logic and presentation are difficult to change independently. |
| Form host | `src/components/work/WorkContextForm.vue` selects five forms and owns a shared numeric keypad/focus flow. It has no component-local style block. | Form routing, keyboard mechanics and layout are coupled in one host. This shared host may be appropriate, but its contract needs to be explicit and stable. |
| Individual forms | Start shift, fare, cancellation, fuel and end shift are separate Vue components, but none currently declares its own style block. | The component boundary exists in markup, but visual ownership is not local to each component. |
| Shared styling | `src/styles/kfe-ui.css` is approximately 184 KB. Source inspection finds repeated global styling for common hooks including `.form-card`, `.primary-action`, `.input-unit`, `.eyebrow`, `.text-action`, `.form-head` and `.check-row`. | Editing a shared selector can move, resize or restyle multiple forms. Some shared styling is intentional; its scope must be explicit rather than accidental. |
| Impact tooling | `tools/presentation-impact.mjs` follows local imports and can report overlaps in unscoped stylesheets when a style file itself is requested. | For a Vue template change it does not currently inventory the class hooks used by that component and report other components styled through those hooks. Its current output is a dependency warning, not proof of visual isolation. |
| Shell | `KfeShell.vue` has an existing shell boundary contract and tests. | This protects the shell/business boundary but does not by itself isolate individual forms, buttons, metrics or CSS hooks. |

## Shared form hooks confirmed in the initial inventory

The form components reuse several global hooks:

- `.form-card`
- `.primary-action`
- `.input-unit`
- `.eyebrow`
- `.text-action`
- `.form-head`
- `.check-row`
- `.choice-row`
- `.focus-surface`

These should not all be blindly duplicated. The target is **explicit reuse with stable shared-component contracts**, plus **local ownership for form-specific layout and variants**. A change to a generic primary button should affect all consumers only when the shared-component contract says it should; a fare-form-only change must not move the cancellation or end-shift button.

## Target separation

1. **Presentation shell:** routes, safe-area/layout slots, navigation and platform-level status only.
2. **Screen composition:** orders independent visual regions; does not own calculations or persistence.
3. **Region/component:** owns markup, accessibility, scoped styling and local interaction state; emits semantic intents.
4. **View model/composable:** adapts canonical read models to screen state and dispatches intents; no markup or CSS.
5. **Application use cases:** validates and orchestrates business commands, recovery and acknowledgements.
6. **Domain calculations/state transitions:** pure deterministic rules, independent of Vue/Android layout and storage APIs.
7. **Repository/storage adapters:** canonical durable reads/writes, revisions, idempotency and audit/outbox.
8. **PWA/Android adapters:** platform-specific UI, lifecycle, GPS and permission handling; they call the same command contract and do not define separate business rules.

## Required component isolation contract

Every major UI region should have:

- A stable semantic component name and stable test ID/role where useful.
- Explicit props/events; no access to unrelated form state or stores.
- Scoped CSS or an explicitly named shared design-system component/token.
- No positional coupling to sibling markup (for example, broad selectors that depend on a sibling's DOM order).
- No implicit global style side effects from adding/removing a class.
- A documented shared-style consumer list for intentionally global variants.
- Stable keyboard/focus, submit, disabled/busy, error, loading and success behavior.
- A component-level test for semantic output and action events.
- A visual/layout regression assertion for the affected region and its nearest neighboring regions.

## Refactor sequence — preserve behavior

1. **Freeze baseline:** capture current screenshots/geometry and interaction contracts for each Work state/form, including keypad open/closed, validation, busy/error/success and small-screen/native overlay variants.
2. **Build class ownership map:** map each Vue component's class hooks to CSS selectors, other components that use them, and tokens/variables consumed. Extend `ui:impact` so Vue markup changes also report shared global CSS hooks.
3. **Extract view model:** move derived state, timer projections and event/command coordination out of the Work template component without changing markup, selectors, action names or persistence semantics.
4. **Extract form-host mechanics:** isolate keypad/focus mechanics from form selection while preserving numeric field navigation and submit behavior.
5. **Migrate form-specific CSS:** move one form at a time to scoped CSS or explicit variants. Keep shared design-system styles shared and intentional. Avoid mass renaming or a single giant CSS rewrite.
6. **Separate component behavior:** give buttons, status badges, metric cards, form sections and overlay controls explicit component contracts and local layout ownership.
7. **Enforce dependency direction:** UI emits intents; application coordinates; domain calculates; repositories persist; PWA/native adapters reconcile. No presentation import from domain/repository and no UI component direct storage access.
8. **Run the presentation impact report and focused tests after each small change.** Compare unaffected form/button geometry and action contracts; only then move to the next component.
9. **After all focused changes pass, run the full contract suite/build/UI isolation gate and exact-APK Android tests.** Do not merge a partial visual refactor.

## Baseline exit criteria

- The same command from PWA and overlay produces the same canonical transition and durable record.
- Each form can change its local spacing, field order or button placement without changing other forms unless an explicit shared-component contract is intentionally changed.
- Each button has a stable semantic action and local placement owner; sibling DOM order does not determine its location.
- A presentation-only change cannot alter calculations, persisted fields, canonical operation IDs or state transitions.
- A domain/storage change cannot silently change presentation geometry; affected read-model contracts and UI regression checks must identify intended changes.
- The impact tool lists affected consumers and global style hooks for both Vue template and CSS changes.
