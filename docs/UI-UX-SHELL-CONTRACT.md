# KFE UI/UX & Shell Contract

**Status:** AUTHORITATIVE — single source of truth for presentation, visual design, shell behavior, screen composition, and interaction presentation.  
**Scope:** KFE PWA and its relationship to the native Android overlay/notification.  
**Business authority:** `KFE_BUSINESS_RULES_REGISTER.md`, domain/application contracts, and the frozen Work workflow remain authoritative for business meaning and operational transitions.

> **Core guarantee:** A presentation-only change must not change business behavior. If a requested change can cross that boundary, raise a visible **CHANGE IMPACT WARNING before editing**. Never silently broaden the scope.

## 1. Architecture boundaries

KFE uses one directional ownership chain:

```text
Platform / native capabilities
        ↑ adapters only
Persistence and repository contracts
        ↑
Domain rules and calculations
        ↑
Application use cases, commands and read models
        ↑
Screen view models / screen state
        ↑
Reusable UI components
        ↑
One application shell
```

Dependencies flow from presentation toward application contracts; business/domain code never imports presentation. The shell is a presentation composition, not a business orchestrator.

| Layer | Owns | Must not own |
|---|---|---|
| Domain | Business meaning, invariants, validation rules, calculations, authoritative transition rules | Vue, CSS, routes, browser lifecycle, Android UI |
| Application | Use cases, orchestration, command handling, read models, recovery coordination | Layout, styling, DOM, visual placement |
| Persistence/repositories | Authoritative records and storage access through contracts | Screen composition or visual state |
| Screen/view model | Screen-specific display projection, transient selection/focus/expanded state, dispatching intents | Independent calculations, direct DB writes, second state authority |
| Reusable UI component | Its own rendering, local interaction mechanics, semantic events and accessibility | Business rules, route ownership, persistence, unrelated screen state |
| Shell | Shared frame, navigation, safe areas, viewport/keyboard coordination, theme provider, global feedback/overlay hosting | Trip, fare, KM, EMI, profit, loan or target calculations; operational lifecycle authority |
| Native adapter/overlay | Platform-specific presentation of authoritative app state and commands | A separate operational workflow or second source of truth |

Data flow:

```text
User interaction → UI intent → application command → domain validation/rules
→ authoritative persistence → read model → screen rendering
```

Rendering and animation never prove that an operation committed. A UI reports success only after the authoritative command returns confirmed success.

## 2. Shell ownership rules

There is exactly one authoritative production PWA shell and one primary navigation authority.

The shell owns:
- Shared application frame and brand identity.
- Header and globally shared status affordances.
- Primary navigation and current-route indication.
- Main-content host and its safe-area/viewport constraints.
- Theme selection/application.
- Shared modal/overlay hosting and global feedback placement.
- Global keyboard/back-navigation coordination where appropriate.
- Stable shell regions and z-index/layering policy.

The shell may subscribe to **platform-level status** such as GPS availability when that status is shared shell context. It must not start, complete, validate or persist a trip; calculate a business metric; or call a business service to decide visual layout.

Screens own their own content and emit intents. The shell must not inspect screen internals, reach into screen stores, or infer business state from CSS classes, component visibility, route-name hacks, or DOM queries.

A screen may opt into documented shell slots/metadata (for example, whether a header is shown) through a typed presentation contract. It must not create a competing fixed header or bottom navigation.

Global shell changes are cross-screen by definition. Before changing shell geometry, shared z-index, viewport sizing, global CSS, theme tokens or navigation, list the affected routes and run the impact checks. A change requested for one screen must not be applied globally just because the global selector is easier.

## 3. Screen ownership rules

Every production screen (Work, Timeline, Performance, Admin) owns:
- Its content composition and semantic regions.
- Its screen-level view model and transient presentation state.
- Its loading, empty, no-results, error, unavailable and success presentation.
- Its own local scroll region, where required.
- The user intents it can emit and the accessible names of its actions.
- A stable set of semantic component identifiers for important regions and controls.

Screens consume application read models and commands. They do not directly access IndexedDB, browser storage, repository implementations, infrastructure adapters, or domain calculation modules.

Timeline is a reporting surface, not a separate data or calculation authority. Performance formats and explains authoritative metrics; it must not reproduce business formulas. Admin forms collect inputs and present validation from the authoritative command path; they do not become a second validation/persistence authority.

A screen's internal layout may be changed without changing its route, business state, command payloads, persisted records, calculation inputs, or downstream consumers. Screen-specific layout must not leak into the shell or other screens through broad selectors or shared mutable state.

## 4. UI component ownership rules

Components should have a single, named responsibility and stable semantic identity. Examples include a metric card, section header, status badge, form field, dialog, bottom sheet, and Work swipe control.

A component may own:
- Markup and component-scoped styles.
- Local visual state (pressed, focused, expanded, dragging, animation progress).
- Input formatting that does not alter business meaning.
- Accessible roles, names, descriptions and state announcements.
- Emitting semantic events such as `confirm`, `cancel`, `change`, or `swipe-commit-request`.

A component must not own:
- Business calculations or eligibility decisions.
- Direct authoritative persistence.
- Hidden route transitions.
- Global theme mutation outside the theme service/provider.
- Another component's private state.
- Operational success inferred from animation completion.
- Duplicate UI or a hidden fallback version of a retired component.

Prefer component-scoped CSS and design tokens. Do not style a single card/bar by changing broad element selectors or global utility classes if that could alter unrelated screens. Use explicit variants/props for intentional shared styling changes. Keep business command interfaces stable while visual components are replaced.

## 5. Navigation

Primary navigation is **Work | Timeline | Performance | Admin**. It is shell-owned and stable. The selected route is communicated visibly and accessibly; icons do not replace labels where labels are needed.

Rules:
- A presentation rearrangement does not change route paths, route guards, browser history behavior or route metadata.
- Back navigation is predictable and preserves useful form input, search/filter context and scroll position when appropriate.
- Unsaved changes use the owning workflow's established Stay/Discard behavior.
- Screen-local tabs, filters and drill-downs remain screen-owned.
- Month → Week → Day in Timeline is a presentation/navigation hierarchy, not a new business module or authority.
- Deep links and refreshes must continue to resolve through the existing router/deployment fallback contract.

## 6. Viewport / safe-area / keyboard

The visible viewport is a runtime constraint, not a fixed design mock. Layout must account for browser chrome, status/navigation bars, device cutouts, safe-area insets, dynamic viewport height and the native keyboard.

Rules:
- Use safe-area-aware shell padding and a single documented viewport sizing strategy.
- Do not use fixed heights that hide required controls on short devices.
- When the native keyboard opens, treat the reduced visible area as the active viewport.
- Use the platform's native text/numeric keyboard and correct input type. Do not introduce a custom numeric keypad without a separately approved product decision.
- The focused field, its context, required fields and the action needed to complete the active interaction must remain visible/reachable.
- Short driver forms (fare, cancellation, fuel/refuelling, odometer/shift confirmation) are viewport-fit and non-scrolling. Reflow/reposition the surface instead of introducing scrolling solely to work around the keyboard.
- Long exception lists may scroll when genuinely necessary.
- Keyboard Next/Enter/Done behavior must follow the form's field order and final action.
- Keyboard/viewport changes must not mutate business state or reset form values.

## 7. Scrolling

Every scrollable region must have one explicit owner. Do not allow the body, screen content, card, and shell to scroll the same content simultaneously.

- Shell-fixed header/navigation stay fixed where specified by the shell contract.
- Main screen content scrolls only in its declared region.
- Fixed controls reserve layout space; content must never disappear underneath navigation, swipe controls, keyboard, or safe-area insets.
- Work normal states should fit the viewport without page scrolling. Only genuinely long state-specific content may scroll in a named content region.
- Short operational forms remain non-scrolling.
- A gesture beginning on the swipe handle/hit area belongs to the swipe control; a gesture beginning outside it follows normal scrolling.
- No global `overflow: hidden` or touch-lock workaround may break another route.
- Scrolling behavior must be tested at short and tall viewport sizes and with the keyboard open.

## 8. Overlays

Dialogs, sheets, toasts, diagnostic surfaces, native notifications and the Android operational overlay have explicit owners and layering rules.

- Each overlay declares its trigger, dismissal rules, focus behavior, z-index layer and owning workflow.
- An overlay may be moved, resized or restyled without changing the underlying command or authoritative state.
- Opening/closing a presentation overlay cannot create, undo or duplicate business records.
- Closing an overlay must preserve committed work and follow the owner's unsaved-input rule.
- Background/telemetry status must not block a valid user action unless the authoritative business contract explicitly requires it.
- PWA swipe bar and Android overlay are independent movable/minimizable surfaces; moving or minimizing one must not move/minimize the other.
- Both surfaces reflect the same persisted operational state and invoke the same authoritative command path. Neither becomes a second workflow or state authority.
- Theme/layout changes in the PWA must not silently change native Android layout. Native changes are a separately named impact surface and require native/overlay tests.

## 9. Theme

KFE has one shared theme authority with **Auto / Light / Dark** modes. Components consume semantic tokens; they do not maintain independent theme palettes.

Auto uses the configured day/night schedule (default 06:00–19:00 day and 19:00–06:00 night, subject to user-editable schedule). Theme changes affect presentation only and must never change calculations, records, timestamps, targets, shift timing or workflow state.

Semantic tokens cover background, surfaces, primary/secondary/muted text, borders, accent, success, warning, error, information, focus, touch target, spacing and radii. Use the existing canonical CSS variables in `src/styles/kfe-ui.css`; do not create a parallel token palette or hard-code one-off colors where a semantic token exists.

Visual language:
- Clean, calm, professional and highly readable; avoid decoration that does not improve comprehension.
- Information hierarchy: current state → important target/metric → primary action → critical status → supporting detail.
- Reuse typography hierarchy, spacing scale, radii, icon treatment, focus states and semantic colors.
- Light mode uses readable near-white surfaces; dark mode uses dark charcoal/navy and readable off-white text rather than pure-black glare.
- Semantic color is never the only indicator; pair it with text, icon or structure.
- Theme/contrast changes must be verified on Work, Timeline, Performance and Admin, including disabled, focus, error, success and overlay states.

Changing a token is potentially global. A one-screen theme adjustment should use a component/screen-scoped token override, not modify a shared root token without warning and explicit cross-screen review.

## 10. Responsive behavior

KFE is mobile-first. One semantic screen adapts to available space; responsive variants must not become competing applications or alternate business workflows.

- Preserve task, information hierarchy, labels, state, and command behavior across widths.
- Prefer content-driven breakpoints rather than device-name assumptions.
- Mobile prioritizes glanceability, thumb reach, legibility, low typing burden and safe interaction.
- Tablet/desktop may use extra space only where it improves comprehension; do not add dashboard cards just to fill space.
- Dense admin tables may become purpose-built responsive rows/cards rather than simply shrinking.
- Longer labels/localization, text scaling and large numbers must not overlap or clip.
- Small-height and keyboard-open viewports are first-class test cases.
- Reflow/repositioning is presentation-only unless it changes reachability, interaction semantics or workflow; any such change needs explicit verification.

## 11. Accessibility

Accessibility is required for every screen and shared component:
- Semantic HTML and appropriate roles/labels/descriptions.
- Logical focus order and visible `:focus-visible` treatment.
- Sufficient contrast in both themes.
- Comfortable touch targets using the shared touch token.
- Text zoom/scaling and long-label resilience.
- State changes announced without excessive interruption.
- No color-only meaning.
- Reduced-motion support.
- Keyboard access for applicable controls.
- Accessible non-swipe alternative for every critical swipe action, invoking the same authoritative command and validation path.
- Focus is trapped/restored appropriately for modal dialogs and sheets.
- Disabled, unavailable, loading, selected and focused states remain distinguishable.
- Error messages identify the problem and recovery path; validation is associated with its field.

## 12. Loading / empty / error states

Every screen and data-driven component defines relevant states: initial/loading, usable local data, refreshing/updating, empty, no results, offline/local, error, unavailable, disabled, saving, success and partial/exceptional data.

- Prefer local usable data and background work where possible.
- Do not block the entire screen for a small component refresh.
- Empty states explain why there is no content and what the user can do next.
- Errors are specific, calm, actionable and recoverable; preserve entered data when safe.
- Distinguish validation rejection, local persistence failure, GPS/permission failure and remote synchronization failure.
- Never report Saved/Synced/Completed before the relevant authoritative operation confirms it.
- Offline is a supported state, not inherently an error.
- Retry must not create duplicate commands or records.
- A theme/layout change must preserve every state and its semantic message.

## 13. Interaction and gesture rules

Every interaction defines its start area, permitted movement, commit point, cancel/early-release behavior, busy/disabled state, success/failure feedback and accessible equivalent.

General rules:
- Separate gesture mechanics from the command they request.
- A tap or incomplete gesture must not commit an authoritative operation.
- Prevent duplicate submissions in both UI and command/application layers.
- Visual animation follows the pointer/gesture but never acts as the authority.
- Validate current state and mandatory fields before commit.
- Persist before presenting durable success.
- GPS/network enrichment must not delay an otherwise valid offline-capable transition.
- Interrupted operations recover from persisted state, not from the last animation frame.
- Destructive/high-impact changes receive appropriate confirmation; routine reversible actions use lightweight feedback/undo where safe.
- Preserve the existing business command and transition contract when changing handle size, color, placement, track shape, labels or animation.
- Do not introduce global touch handlers or pointer capture that interferes with unrelated controls.

## 14. Work cockpit-specific rules

Work is a driver cockpit, not a generic ERP dashboard. It prioritizes **current state → relevant context → one obvious next action** and uses one canonical state-driven composition.

The established operational sequence remains owned by the Work/business contracts, including shift start and odometer gap gate, ready/online state, pickup, trip start/cancellation, active trip, trip completion/fare entry, next pickup, end shift, reconciliation, shift review and shift ended. This document does not redefine business eligibility or calculation rules.

Presentation invariants:
- One Work composition; do not restore a historical Work screen or introduce a parallel/hidden fallback implementation.
- The top shift-state control, target/progress/timer context, current state/context, and primary action remain semantically identifiable. Their exact visual placement may be changed as a presentation-only request when the owner and impact checks show isolation.
- Work normal states should fit the viewport without page scroll; only genuinely long dynamic content may use its declared scroll region.
- Fixed bottom navigation and the primary swipe surface must never overlap or hide required content.
- The authoritative swipe actions remain exactly **GO TO PICKUP**, **START TRIP**, and **END TRIP** in the applicable workflow state. All use rightward handle drag, deliberate threshold, release-to-commit, safe early release, duplicate protection and the same authoritative command path.
- The handle follows the pointer; incomplete gestures do nothing. GPS, place-name resolution and network availability do not block otherwise valid operations.
- Semantic action colors are blue for GO TO PICKUP, green for START TRIP and red for END TRIP; color is supplemented with clear labels and interaction state.
- The PWA bar and Android overlay swipe control retain equivalent gesture mechanics and command semantics, while remaining independently movable/minimizable.
- After trip completion, required fare entry appears immediately and remains until the authoritative fare operation succeeds. Required forms preserve input on validation/persistence failure.
- Fuel/refuelling remains a compact secondary action, not a permanently expanded block. Short driver forms use native keyboard and remain viewport-fit/non-scrolling.
- Driver UI does not calculate fare, trip distance, dead KM, target, fuel quantity, profit, EMI or other business figures independently.
- The overlay/notification is a projection of persisted Work state; it must not become a separate operational state machine.
- A visual relocation of the swipe bar is allowed; changing its command, commit threshold semantics, gesture ownership, fixed-position/safe-area contract, overlay parity or state transition is not a layout-only change and triggers a warning.

## 15. Forbidden coupling

The following are contract violations:
- Shell imports/calls Work, Performance, Finance, loan, fare, trip-mutation or calculation services.
- Vue screens/components access IndexedDB/browser storage or repository/infrastructure implementations directly.
- UI computes authoritative business totals or duplicates domain validation.
- CSS/layout choices determine operational state or workflow eligibility.
- Domain/application modules import Vue, CSS, DOM or shell components.
- Shared/global CSS changes are described as screen-local without checking every selector consumer.
- One screen mutates another screen's transient state or reads its DOM to coordinate behavior.
- Overlay/notification maintains a second trip state or independent command path.
- A component replacement leaves a hidden legacy implementation or parallel interaction path.
- UI reports success from an animation, optimistic local visual state or unconfirmed remote result.
- A design/layout request silently changes route behavior, form requirements, persisted fields, calculations, business command payloads or native behavior.

## 16. Automated decoupling tests

The canonical `npm test` suite must enforce this contract. At minimum it must check:
1. This document exists and includes all required ownership, interaction and verification sections.
2. Obsolete presentation-rule documents are removed and current references point to this contract.
3. The shell remains a shared shell and does not import business stores/services or persistence directly.
4. The `ui:impact` command remains wired to the dependency-impact tool.
5. Presentation impact warnings remain a required pre-change gate.
6. Existing shell, UI, accessibility, Work, overlay/native and runtime contracts remain in the test runner.
7. The UI test suite checks semantic behavior rather than obsolete component class names/DOM wrappers.
8. A visual-only change is validated against the existing business/command contracts without rewriting them to satisfy a layout assertion.

Pre-change command:

```bash
npm run ui:impact -- src/path/to/component.vue
```

For a multi-file or shared change, pass every known changed path in the same invocation. Review all warnings before editing. A red protected-layer warning blocks treating the change as presentation-only. A yellow dependency warning means the dependent presentation files must be reviewed and tested together.

**Important limitation:** the current impact tool is a local import-dependency check. It does not yet prove the absence of every CSS cascade, selector, runtime slot, native overlay, or visual-regression dependency. A green result is not a guarantee of total isolation; global tokens/styles, shell geometry, swipe gesture mechanics, and native/PWA parity require the explicit verification matrix below. Do not suppress or reinterpret this limitation as a clean bill of health.

## 17. UI verification matrix

Every changed surface must record evidence for each applicable row. A non-applicable row needs a reason; it must not be silently skipped.

| Surface / concern | Required check | Pass condition |
|---|---|---|
| Shell | Header, primary nav, content host, fixed regions | One shell; no duplicated nav/header; no overlap |
| Work | All applicable operational states | State/context/action remain correct; no workflow change from layout |
| Timeline | Day/week/month and empty/no-result states | Correct route, period controls and reporting semantics |
| Performance | Metrics, period controls, details and provision/loan views | Canonical values/units/rounding unchanged |
| Admin | Home, forms, finance and management areas | Fields/actions remain reachable; validation authority unchanged |
| Theme | Auto, Light, Dark | No unreadable text, missing state or hard-coded conflicting surface |
| Viewport | Narrow/wide and short/tall viewport | No clipping, unintended page scroll or unreachable control |
| Keyboard | Native numeric/text keyboard open/closed | Focused field and completion action visible; short forms do not scroll |
| Scrolling | Screen and local regions | Exactly intended region scrolls; fixed controls remain visible |
| Overlays | Modal/sheet/toast/diagnostic/native overlay as applicable | Layering, focus, dismissal and underlying state preserved |
| Swipe | Idle, dragging, threshold, early release, committing, success/failure | Pointer tracking, threshold, commit point and duplicate protection preserved |
| Accessibility | Keyboard, screen reader semantics, contrast, reduced motion | Required alternative paths and state announcements work |
| Loading/empty/error | Applicable state variants | Correct message, recoverability and preserved input |
| Visual regression | Before/after captures at relevant viewports/themes | Only intended presentation properties change |

## 18. E2E verification matrix

| Flow | Required end-to-end assertion |
|---|---|
| Route navigation | Work → Timeline → Performance → Admin and browser back/refresh work |
| Theme switch | Theme changes presentation only; route, state, records and calculations remain unchanged |
| Screen-local layout edit | Only the intended screen/component changes; other screens remain visually/functionally stable |
| Shared token/style edit | All known token/selector consumers are reviewed and tested |
| Work swipe | Same valid command, validation and persisted transition; early release creates no mutation |
| Fare/cancellation/fuel forms | Keyboard-safe input, validation, preserved input, one authoritative commit |
| Native overlay parity | Same persisted state and command semantics; independently movable/minimizable surfaces |
| Offline/restart | Persisted state recovers; UI animation/temporary state is not treated as authority |
| Error/retry | Failure is visible and recoverable; retry does not duplicate records |
| Build/deploy | Production build and deployed routes reflect the tested commit |

### Required sign-off

Report these separately:
- **Contract/source verified:** ownership boundaries and static assertions pass.
- **UI verified:** rendered screen/interaction assertions pass for the changed surfaces.
- **E2E verified:** authoritative command/persistence/reload and downstream behavior pass.
- **Native device verified:** only when the relevant real-device gate was actually run.

A green build or import-impact check alone is not UI or E2E sign-off.

## Change isolation and warning protocol

A request may be expressed as one concise change instruction, for example:

> “Move the Work swipe bar below the target card. Keep its size, rightward gesture, threshold, command, state transitions, fixed navigation and Android overlay behavior unchanged.”

Implementation must then:
1. Identify the semantic component/region and its owning screen.
2. Run the impact command and inspect component, CSS/token, shell, overlay and test dependencies.
3. **Before editing**, issue **🟢 ISOLATED**, **🟡 DEPENDENCY WARNING**, or **🔴 CHANGE IMPACT WARNING** with the affected files/surfaces and why.
4. For 🟢, change only the owned presentation boundary and run relevant tests.
5. For 🟡, enumerate the dependent presentation surfaces and test them together.
6. For 🔴, stop the presentation-only edit until the cross-layer impact is explicitly resolved; do not silently modify business/native contracts.
7. Verify the diff contains no unrelated files or business logic changes.
8. Run the UI matrix and applicable E2E checks, then report actual results.

The warning must precede a potentially cross-boundary edit, not appear only in the final report.

## Known implementation gap

This contract establishes the source of truth and required guardrails. The current repository has an import-based `ui:impact` command, but it does **not yet prove** that every card/region can be relocated through a declarative layout manifest or that CSS/runtime/native dependencies are exhaustively detected. Do not claim “one-command layout editing with guaranteed zero collateral impact” until a layout-configuration layer and corresponding isolation/visual regression tests are implemented and passing. Until then, the safe workflow is one clear change request + impact preflight + scoped implementation + UI/E2E verification.
