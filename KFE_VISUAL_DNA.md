# KFE Visual DNA

**Status:** FROZEN  
**Purpose:** Governing visual, interaction, accessibility, responsive, PWA, and future-feature design language for KFE.

## 1. Governing Principle

KFE should look **modern, attractive and professional**, while every visual decision serves the purpose of the screen, the user's task and the underlying business function.

**Priority:** Purpose → information hierarchy → usability → clarity → professional appearance → visual polish.

Attractive does not mean decorative. Avoid unnecessary gradients, animation, giant labels, card soup, gimmicks, excessive shadows, and decoration that does not improve the task.

Professional means trustworthy, precise, controlled, organized, mature, consistent, polished, reliable, and efficient.

## 2. Design Protection

Existing KFE screen layouts, workflows, business meaning, information structures, and approved interaction concepts must not be changed merely for visual novelty.

Visual DNA is applied **to** existing screens; it is not a justification to silently redesign them.

If a structural change becomes necessary:

**🔴 DESIGN DRIFT / CONFLICT WARNING**

The conflict must be identified explicitly before changing the established design.

## 3. One KFE DNA

**One KFE DNA → three experience modes → four existing menu areas**

- Driver Experience: Work + Timeline
- Performance Experience: Performance
- Admin Experience: Admin

These are visual personalities, not separate applications.

All modes inherit the same typography, spacing, components, icons, semantic colours, accessibility, interaction rules, navigation, feedback, theme behaviour, responsive behaviour, and PWA behaviour.

## 4. Visual Character

**Clean + premium + calm + operational + highly readable**

Reference: professional vehicle instrument system, not a generic business dashboard.

Visual emphasis follows operational importance:

1. Current state
2. Important target
3. Primary action
4. Critical status
5. Supporting information

## 5. Theme System

KFE supports **Auto / Light / Dark**.

Auto is the default and uses device local time by default.

- Day: 6:00 AM → 7:00 PM
- Night: 7:00 PM → 6:00 AM

The schedule is user-editable. Manual Light/Dark override remains available.

Theme changes affect presentation only, never business calculations, shift timing, targets, records, or business rules.

Light mode uses soft near-white surfaces and high readability.

Dark mode uses dark charcoal/navy rather than pure black, off-white text, muted accents, reduced brightness, and no excessive glow.

Theme switching is quiet.

## 6. Visual Tokens

### Light

- Background `#F5F7FA`
- Primary surface `#FFFFFF`
- Secondary surface `#EEF2F6`
- Primary text `#17202A`
- Secondary text `#5B6673`
- Muted text `#7D8792`
- Border `#DCE2E8`
- Accent `#2563EB`
- Success `#16803C`
- Warning `#B76E00`
- Error `#C62828`
- Info `#2563EB`

### Dark

- Background `#10151B`
- Primary surface `#171E26`
- Secondary surface `#202934`
- Primary text `#E8EDF2`
- Secondary text `#AAB4BF`
- Muted text `#7F8A96`
- Border `#303A46`
- Accent `#5B8DEF`
- Success `#4DBD74`
- Warning `#E2A93B`
- Error `#F06A6A`
- Info `#6FA0FF`

These are system tokens, not scattered one-off colours. Brand accent is used sparingly. Semantic colours never carry meaning alone; use text, icons, or structure as well.

## 7. Typography

Use a modern, highly readable sans-serif system stack.

Hierarchy:

- Display metric
- Page heading
- Section heading
- Body
- Supporting text

Important operational numbers have deliberate visual hierarchy. Units are visually subordinate.

## 8. Spacing, Radius and Elevation

Spacing scale:

**4 → 8 → 12 → 16 → 24 → 32 → 40**

Common operational spacing: 8/12/16/24.

Radius guidance:

- Small controls ~8px
- Standard controls/cards ~12px
- Large panels ~16px
- Sheets/dialogs ~16–20px

Avoid excessive pill UI except where appropriate. Use subtle borders, surfaces, and restrained elevation. Avoid card soup and heavy shadows.

## 9. Component Hierarchy

**Page → Section → Surface → Content → Control → Feedback**

A surface exists when it communicates meaningful grouping, relationship, state, or action. Not everything becomes a card.

## 10. Experience Modes

### Driver

Work + Timeline are glanceable, action-led, low-input, driving-safe, confirming, offline-confident, forgiving, progress-oriented, context-aware, and quiet.

Work should feel like a digital instrument cluster, not a generic ERP dashboard.

### Performance

Analytical, precise, comparative, and information-rich without clutter.

### Admin

Structured, controlled, comprehensive, manageable, and data-oriented.

## 11. Navigation

Primary navigation remains:

**Work | Timeline | Performance | Admin**

Navigation is stable and consistent. Current location must be obvious.

Icons support recognition but do not replace important labels where labels are needed.

Selected, default, pressed, focused, and disabled states must be distinguishable.

Secondary navigation is subordinate to primary navigation.

## 12. Search, Filtering and Sorting

Search is contextual, readable, and easy to clear.

Active filters must be visible and removable where appropriate. Complex mobile filtering may use a bottom sheet where appropriate to the existing layout.

Filtering never changes stored business meaning.

Sorting must clearly communicate field and direction without visual noise.

## 13. Lists and Tables

Operational lists prioritize:

**Primary information → status/context → important number → supporting detail**

Administrative tables may be denser and support sorting, filtering, comparison, editing, and status recognition.

Desktop tables must not simply be shrunk onto phones. Responsive presentation is selected according to purpose.

Lists/tables have deliberate loading, loaded, empty, no-result, error, offline/local, and updating/syncing states.

## 14. Responsive Behaviour

KFE is mobile-first.

Responsive design preserves task and hierarchy while adapting presentation to available space.

Mobile prioritizes thumb-friendly controls, readable numbers, adequate spacing, minimal typing, safe interaction, and important information without excessive navigation.

Tablet and desktop use additional space only where it improves comprehension. Do not manufacture dashboards merely because space exists.

Breakpoints respond to content and usability.

## 15. Forms

Forms are:

**Professional + modern + attractive + effective — without compromising purpose.**

Core principle:

> Capture automatically where possible. Ask only for what KFE cannot reliably know. Make remaining input fast and forgiving.

Use visible labels, clear required/optional states, smart defaults where permitted, correct input types, sensible keyboards, appropriate units, useful validation, preserved input on errors, clear actions, accessible focus, and deliberate grouping.

Validation is immediate only when useful, on blur for obvious formatting, and on save for business-rule validation.

Driver forms are focused and forgiving. Admin forms can be comprehensive and structured.

Read-only information must not look like a disabled input.

## 16. Interaction States

Interactive components use appropriate states:

**Default → Focus → Pressed → Loading → Success/Error → Disabled**

Hover may exist on desktop.

Focus must remain obvious.

## 17. Selection

Selected, active, focused, and checked are distinct concepts and must not be visually conflated.

Multi-selection has a clear selected state and clear available actions.

## 18. Action Hierarchy

- Primary: advances the main task
- Secondary: useful supporting action
- Tertiary: supporting/detail action
- Destructive: removes, resets, or discards

Visual weight reflects operational importance.

## 19. Trip Start / End Swipe

Trip Start/End is a special KFE interaction, not an ordinary button.

States:

1. Ready — START TRIP / Swipe →
2. Swiping — handle follows finger
3. Threshold — Release to Start
4. Starting — Starting Trip…
5. Active — TRIP ACTIVE
6. Ending — Ending Trip…
7. Completed — TRIP COMPLETED ✓

Use a large grab handle, strong contrast, large touch area, clear directional cue, subtle feedback, deliberate threshold, clear completion feedback, and an accessible alternative where needed.

## 20. Feedback and Notifications

Every important action receives an appropriate amount of feedback.

Levels:

1. Inline
2. Snackbar/toast
3. Banner
4. Dialog/confirmation

Notification priority:

- 🔴 Needs action now
- 🟠 Review when convenient
- 🔵 Information
- ⚪ Background

Driver notifications must not unnecessarily interrupt driving.

## 21. Confirmation and Undo

Do not confirm every action.

Use lightweight feedback for ordinary actions, confirmation for meaningful consequences, and stronger confirmation for irreversible/high-impact actions.

Where safely reversible, prefer Undo.

## 22. Loading, Empty and Error States

Prefer local data first and background work where possible.

Avoid unnecessary full-screen spinners.

Empty states explain what happens next.

Errors are **specific + calm + actionable + recoverable**.

## 23. Offline and Sync

Preferred states:

**OFFLINE · SAVING ON DEVICE**

then:

**ONLINE · SYNCING**

then:

**SYNCED**

If synchronization fails:

**Sync paused — Your data is safely saved on this device. — Retry**

Offline is a capability, not an error condition.

## 24. PWA Shell and Launch

KFE should feel like an application.

Preferred startup:

**KFE identity → app shell → local data → usable screen → background work**

Local data should become useful as early as possible.

Updates should not unexpectedly interrupt active operational work.

## 25. Back, Keyboard, Safe Areas and Orientation

Back navigation must be predictable and preserve useful state such as form input, search, filters, scroll position, and context.

Unsaved changes require an appropriate Stay/Discard decision.

Keyboard opening must not hide focused fields or critical controls.

Controls respect safe areas.

Avoid unnecessary orientation changes.

### 25.1 Frozen Native Keyboard + Keyboard-Safe Viewport Rule

KFE uses the **device-native keyboard** for text and numeric input throughout the PWA.

For numeric entry, KFE uses the appropriate native numeric input type so the platform presents its native numeric keyboard. KFE must not replace the native numeric keyboard with a custom keypad unless a future explicitly approved design decision changes this rule.

When the native keyboard opens, KFE treats the reduced visible area as the active viewport and adapts the relevant UI to it.

The focused input and the controls required to complete the active interaction must remain accessible.

**Nothing required for the active interaction may be hidden underneath the keyboard.**

For short KFE driver forms:

- the form itself must not become scrollable merely because the keyboard opened;
- the focused field must remain visible;
- labels/context required to understand the field remain visible;
- required fields remain accessible;
- the primary confirmation/action remains accessible;
- the layout may reflow, resize, reposition, or otherwise adapt to the keyboard-open viewport;
- keyboard-safe behaviour must work across supported PWA screen sizes and device safe areas.

This applies globally to KFE PWA numeric/text entry, including but not limited to:

- fare;
- odometer;
- shift revenue;
- cancellation fee;
- fuel odometer;
- fuel price/kg;
- fuel amount;
- trip KM;
- future numeric entry fields.

Short driver input surfaces such as trip fare, trip cancellation, cancellation confirmation, and CNG refuelling are **viewport-fit and non-scrolling**.

Scrolling remains permitted only where the content is genuinely long and independently requires it, such as a long exception-based reconciliation list. Such scrolling must not be introduced merely as a workaround for keyboard visibility.

This rule governs responsive layout implementation, focus handling, keyboard behaviour, safe-area handling, and future form components across the PWA.

## 26. Accessibility

Accessibility is core.

Requirements include sufficient contrast, visible focus, comfortable touch targets, text scaling, logical focus order, meaningful screen-reader labels, dynamic state announcements, no colour-only meaning, and reduced-motion support.

## 27. Motion

Motion is:

**Fast + subtle + purposeful**

Motion communicates state change, progress, interaction, or continuity. Avoid decorative animation. Respect reduced-motion preferences.

## 28. Data Density and Progressive Disclosure

Driver views use lower density. Performance uses medium density. Admin may use higher density where useful.

Density must never become clutter.

Principle:

> Show what the user needs now → reveal detail when needed.

## 29. Detail Views

Typical hierarchy:

**Summary → operational information → financial information → context/timeline → audit/technical information → actions**

## 30. Numbers, Units, Dates and Time

The number is primary; unit is supporting information.

Formatting must be consistent for ₹, km, km/kg, kg, duration, time, percentages, odometer, and counts.

**Authoritative display format:**

- **Date:** `dd mm yyyy` (two-digit day, two-digit month, four-digit year)
- **Time:** `hh mm ss` (two-digit 24-hour hour, two-digit minute, two-digit second)
- **Date + time:** `dd mm yyyy hh mm ss`
- Use spaces exactly as shown; do not use slash-, hyphen-, comma-, or month-name-based display formats for KFE operational dates/times.
- This is a **display/presentation rule only**. Stored timestamps remain machine-readable and retain their full precision/time-zone meaning.
- Date/time formatting must be centralized and reused across PWA, Android overlay, notifications, Timeline, Performance, Admin, exports, audit/history, GPS events, and future features.
- Business-calendar calculations and persistence must continue to use canonical machine-readable timestamps/date values; display formatting must never alter calculation semantics.
- Where a context needs a date or time alone, use the corresponding format above rather than introducing a new local format.
- Seconds are always displayed for KFE operational timestamps; do not omit seconds from a full time display.

Display formatting never changes underlying meaning.

## 31. Status Vocabulary

Operational:

- Planned
- Ready
- Active
- Paused
- Completed
- Cancelled

Data:

- Draft
- Validated
- Needs Review
- Saved
- Synced

System:

- Offline
- Saving
- Syncing
- Synced
- Update Available

Avoid unnecessary synonyms for identical states.

## 32. Relationships and Context

KFE records may relate to vehicles, drivers, shifts, trips, fuel, expenses, maintenance, targets, revenue, and payments.

Communicate useful relationships without visual clutter.

## 33. Audit and History

May show created, modified, corrected, deleted/soft-deleted, synced, and restored states.

Audit information remains secondary unless the task is specifically audit/history.

## 34. Permissions and Roles

Distinguish:

- Not permitted
- Unavailable right now
- Read-only
- Editable

Do not make unavailable actions misleadingly actionable.

## 35. Data Source / Confidence

Where meaningful, distinguish manual, OCR/screenshot capture, calculated, imported, and synced values.

Source information is subtle and progressive.

## 36. System Truth vs Display Convenience

Visual formatting never changes business meaning.

Filtering does not imply deletion. Display rounding does not alter stored precision. Summaries do not replace underlying transactions. Calculated values remain identifiable where relevant.

## 37. Privacy and Information Exposure

Show information according to purpose. Avoid unnecessary exposure of full addresses, sensitive financial details, technical IDs, or internal implementation details.

## 38. Onboarding and First Use

Teach through the interface where possible.

Avoid large tutorials unless genuinely necessary.

Lightweight guidance may be used for first vehicle, first shift, first ride capture, backup setup, and sync setup.

## 39. Device Permissions

Explain why a permission is needed before requesting it.

Request permissions at the point the capability is relevant rather than presenting a permission barrage at launch.

## 40. Security and Session States

Session expiry, re-authentication, authentication failure, account switching, and locked states should feel like controlled KFE system states rather than generic web errors.

## 41. Localization Readiness

Layouts must tolerate longer labels, text must not be baked into images, controls must expand gracefully, and date/time/number formatting must be rule-driven.

## 42. Print, Export and Share

Outputs may have their own presentation format but inherit KFE hierarchy, terminology, professional identity, and data meaning.

## 43. Future Feature Extension Rule

Every future KFE feature, screen, workflow, component, and interaction must inherit the established KFE Visual DNA.

Process:

1. Identify purpose.
2. Identify Driver / Performance / Admin context.
3. Reuse existing patterns first.
4. Extend existing patterns only when necessary.
5. Check theme, accessibility, and responsive behaviour.
6. Check for design drift/conflict.
7. If genuinely new, document the accepted pattern.

New functionality adapts to KFE's established language; established rules are not silently weakened to accommodate it.

## 44. Design-System Evolution

Future changes are classified as:

**A — Existing pattern reused**  
No design-system change.

**B — Existing pattern extended**  
Document the variant.

**C — New design-system capability**  
Make a deliberate design decision and document it.

**D — Conflict with established DNA**  
Raise:

**🔴 DESIGN DRIFT / CONFLICT WARNING**

The Visual DNA is stable by default but intentionally extensible through controlled evolution.

## 45. Consistency Rule

Consistency does not mean every screen looks identical.

KFE maintains consistency in design language, interaction behaviour, terminology, component logic, accessibility, theme, and feedback while allowing context-specific presentation.

## 46. Governing Future-Feature Statement

> **KFE has one visual and interaction language. Screens may differ according to their purpose, but they must feel like parts of the same professional system. Future features inherit that language and may extend it deliberately, but must not create isolated design patterns or silently weaken established rules.**

## 47. Freeze Record

**KFE Visual DNA — FROZEN**

This specification is the governing visual/interaction reference for applying the DNA screen-by-screen and for evaluating future feature additions.

A future feature may extend this document when a genuinely new pattern is accepted. Such an extension must preserve existing KFE principles and must not silently alter frozen rules.

### Freeze Addendum — Native Keyboard + Keyboard-Safe Viewport

**FROZEN**

The native-keyboard and keyboard-safe viewport rule in section 25.1 is now part of the governing KFE Visual DNA.

It applies globally across the PWA and must be inherited by future forms and numeric-entry components.

This is a design rule only. It does not imply implementation in this commit.
