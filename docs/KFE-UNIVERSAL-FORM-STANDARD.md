# KFE 2.0 — Universal Form Standards

**Status:** Living architectural contract  
**Scope:** All driver-facing PWA forms and interactive form controls  
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
- Virtual keyboards must not permanently cover the active field or required action.
- Conditional fields may appear or disappear according to business logic, but whenever a control is active it must remain reachable.
- Parent containers must not use fixed heights or unsafe overflow behavior that clips active form content.
- Safe-area insets and dynamic viewport behavior must be respected.

### Resilience

- Focused controls must be brought into a usable viewport position when necessary.
- Shared keyboard/visual-viewport handling must be reused; forms must not create competing viewport systems.
- Native constraint validation and business/domain validation must remain compatible.
- Accessibility and usable focus behavior must not be intentionally broken by visual customization.

### Mistake and recovery

- The **Universal Form Action & Recovery Rules** contract remains authoritative for Cancel, Undo, correction, reversal, confirmation, and authoritative domain state.
- UI layers must not invent competing deletion/reversal semantics.
- Unsaved draft restoration must never silently create an authoritative domain mutation.

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
3. Do not create a second keyboard/viewport system.
4. Do not add screen-specific bottom-clearance hacks when a shared rule can solve the issue.
5. Preserve existing business validation and domain commands.
6. Preserve the **Universal Form Action & Recovery Rules** contract.
7. Mark legitimate exceptions explicitly.
8. Verify the active form remains reachable at small viewports, with the keyboard open, with conditional fields present, and with shell chrome visible.

**Permanent principle:**

> One universal architecture, flexible presentation, explicit exceptions, and non-negotiable reachability and recovery.
