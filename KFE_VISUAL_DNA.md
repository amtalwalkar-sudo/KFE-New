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


### Freeze Addendum — Canonical Work State Specification

**FROZEN**

The following specification is the sole design authority for the KFE Work screen.

It is intentionally defined from the KFE Visual DNA and approved current product requirements. Historical Work screen implementations, historical CSS compositions, historical screenshots, and historical commits are **not** design authority and must not be restored or used to reconstruct the canonical Work UI.

The Work screen has **one canonical composition**. The 13 states below are states of that composition, not separate Work screens.

#### Authority split

**Product/business authority — product owner**

The product owner defines and approves:

- business calculations and formulas;
- what constitutes a valid business outcome;
- business eligibility and gating rules;
- exact operational workflow;
- driver-facing task sequence;
- required versus optional business information;
- target, revenue, odometer, fare, cancellation, fuel, reconciliation, and other domain rules;
- driver experience decisions and final acceptance of the user experience.

**Technical authority — implementation**

The implementation defines and enforces:

- component architecture;
- state representation and transition mechanics;
- data flow and persistence boundaries;
- validation plumbing;
- GPS integration and lifecycle;
- offline/local persistence and synchronization mechanics;
- notification lifecycle;
- overlay synchronization;
- accessibility mechanics;
- keyboard and viewport behavior;
- responsive layout mechanics;
- design-token application;
- build, asset, deployment, and runtime verification.

Where a requirement crosses both areas, the business/product decision is authoritative and the implementation translates it into a technically safe mechanism.

The UI must consume authoritative business/domain results. It must not silently invent, duplicate, or reinterpret business calculations.

---

## Work State Specification

### A — 13 canonical states

The canonical Work state set is:

1. **OFFLINE**
2. **Start Shift**
3. **ONLINE idle**
4. **Going to pickup**
5. **Ready for trip**
6. **Trip active**
7. **Fare entry**
8. **Cancellation**
9. **Fuel**
10. **End Shift**
11. **End-shift reconciliation**
12. **Success / completed**
13. **Error / validation**

A state may use an inline state surface, focused form, confirmation surface, or transient feedback surface, but it remains part of the same Work composition.

#### State contracts

**1. OFFLINE**

Purpose: represent the no-active-shift state.

Must expose the Online/Offline control and the persistent Work context required by the approved product experience. The Fuel action remains technically reachable while offline. No active-trip controls are presented.

Entering this state clears transient operational UI while preserving durable business records and appropriate feedback.

**2. Start Shift**

Purpose: establish the shift before operational work begins.

The Start Shift gate appears directly below the Online/Offline control and above Today's Target.

The implementation must support:

- current/start odometer capture;
- authoritative odometer validation;
- authoritative gap calculation;
- Personal KM / Dead KM selection where required by the approved workflow;
- explicit confirmation;
- recoverable validation errors without losing entered data.

Business calculation and acceptance rules remain product authority.

**3. ONLINE idle**

Purpose: represent an active shift with no active trip.

The screen remains glanceable and action-led. Today's Target remains part of the operational context. No trip is shown as active.

Available operational actions are determined by the approved workflow. Fuel remains accessible through its compact action.

**4. Going to pickup**

Purpose: represent an accepted trip/pickup journey before trip start.

The UI must present the authoritative trip/pickup context, current operational status, relevant GPS/movement status, and the actions permitted by the approved workflow.

The implementation must not fabricate movement or arrival state.

**5. Ready for trip**

Purpose: represent the point at which the driver may start the trip.

The primary trip-start interaction is the KFE swipe interaction defined by the Visual DNA, with an accessible non-swipe alternative.

The implementation must enforce the approved trip-start gates and must provide clear progress feedback during the transition.

**6. Trip active**

Purpose: represent an active trip.

The UI must prioritize current trip state and the primary trip-end interaction while retaining required trip context and operational status.

The implementation must preserve GPS/movement tracing and required notification synchronization without making those technical mechanisms visually dominant.

**7. Fare entry**

Purpose: capture required post-trip financial information immediately after trip completion when the approved business flow requires it.

Fare entry must appear without an unnecessary intermediate screen.

The implementation must support pending-fare enforcement, native numeric input, keyboard-safe layout, validation, preservation of entered data on failure, explicit confirmation, and authoritative persistence.

Business fare rules remain product authority.

**8. Cancellation**

Purpose: capture and confirm a cancellation according to the approved business workflow.

The implementation must support the authoritative cancellation reason and fare/financial fields where applicable, validation, preservation of entered data, confirmation, persistence, and resulting-state transition.

The implementation must not invent cancellation consequences.

**9. Fuel**

Purpose: record CNG/fuel activity through a compact, low-distraction interaction.

The permanent full-screen fuel block is not part of the canonical Work composition. Fuel is opened through the compact Fuel action and must be accessible while OFFLINE.

The implementation must capture authoritative fuel fields, automatic timestamp/GPS where available, validate input, persist safely offline, provide confirmation, and close without requiring unnecessary navigation.

Business fuel calculations remain product authority.

**10. End Shift**

Purpose: begin shift closure when there is no active ride.

The End Shift gate appears directly below the Online/Offline control and above Today's Target.

The implementation must support:

- driver start-of-shift odometer visibility;
- closing odometer;
- total shift revenue;
- approved optional business toll/parking information;
- authoritative validation;
- Back cancellation that returns to the ONLINE state without ending the shift;
- explicit submission.

The driver must not need to press Offline a second time after successful end-shift submission.

**11. End-shift reconciliation**

Purpose: review and finalize the authoritative shift-close result.

The implementation presents authoritative calculated values, required exceptions/discrepancies, and the actions required to resolve or confirm them.

Reconciliation calculations and acceptable outcomes are product authority. The UI must not recalculate business totals independently.

**12. Success / completed**

Purpose: provide explicit confirmation that the requested operation has completed.

Success feedback is concise, state-specific, accessible, and non-ambiguous. After confirmation, the Work state transitions to the next approved stable state without requiring redundant actions.

Success feedback must never imply persistence/synchronization that has not actually occurred.

**13. Error / validation**

Purpose: explain and recover from a blocked or failed operation.

Errors are local, specific, calm, actionable, and recoverable. Entered data is preserved whenever technically safe.

Validation must distinguish:

- field/input validation;
- business-rule rejection;
- persistence failure;
- offline/sync state;
- permission/device capability failure.

An error must not silently discard operational input or create a false success state.

---

### B — State transition model

The canonical Work state machine is one composition with state transitions, not multiple screen implementations.

The core operational path is:

**OFFLINE → Start Shift → ONLINE idle → Going to pickup → Ready for trip → Trip active → Fare entry → ONLINE idle**

Shift closure is:

**ONLINE idle → End Shift → End-shift reconciliation → Success / completed → OFFLINE**

Fuel is an interruptible focused state reachable from permitted Work states, including OFFLINE, and returns to the previously valid stable Work state after successful completion or cancellation.

Cancellation is a workflow branch from the operational states where cancellation is permitted by business rules.

Error / validation is a recoverable state associated with the operation that failed; it returns to the owning state after correction/retry.

Technical implementation must model transitions explicitly rather than infer them from CSS, route changes, or incidental component visibility.

Business eligibility for each transition is product authority.

---

### C — Component hierarchy

The Work composition follows:

**Work page → persistent shell/status → state gate/context → operational content → primary action → supporting information → feedback**

The canonical component boundaries should be small enough that local visual changes have local effects.

Recommended technical boundaries:

- Work shell/status;
- Online/Offline control;
- state gate;
- Today's Target;
- operational context;
- trip state/action;
- fare form;
- cancellation form;
- fuel action/form;
- end-shift/reconciliation surfaces;
- feedback/notification surface.

These are implementation boundaries, not permission to create alternate visual compositions.

---

### D — Placement rules

The following placements are frozen:

- Online/Offline control is the primary shift-state control.
- Start Shift appears directly below Online/Offline and above Today's Target.
- End Shift appears in the same state-gate location: directly below Online/Offline and above Today's Target.
- Today's Target occupies the consistent target position in the canonical Work hierarchy when not temporarily displaced by an active state gate.
- Fuel is represented by a compact action rather than a permanently expanded fuel form.
- Primary trip actions occupy the primary-action position.
- Supporting information remains visually subordinate to the current state and primary action.
- Feedback appears close to the operation it describes unless system-level feedback requires a higher-level surface.

No state may introduce a second competing Work layout.

---

### E — Persistent versus state-specific elements

Persistent elements are part of the single composition unless a state-specific rule explicitly replaces their content.

Persistent by default:

- KFE Work shell;
- GPS/status indication;
- shift-state control;
- Today's Target context;
- compact Fuel action where permitted;
- feedback infrastructure.

State-specific:

- Start Shift gate;
- trip/pickup context;
- trip swipe action;
- Fare entry;
- Cancellation;
- Fuel form;
- End Shift;
- Reconciliation;
- Success;
- Error.

State-specific surfaces may change visibility and content but must not create a different Work visual language.

---

### F — Business/UI boundary

The Work UI is a renderer and interaction surface over authoritative business/domain services.

Business/domain services own:

- calculations;
- eligibility;
- authoritative state;
- persistence semantics;
- record relationships;
- business validation;
- reconciliation;
- target calculation;
- revenue calculation;
- odometer business rules;
- fare/cancellation/fuel business rules.

The Work UI owns:

- presentation;
- user input collection;
- interaction state;
- focus;
- accessibility;
- local visual feedback;
- invocation of domain operations.

The UI must never maintain a second competing business calculation merely to display a result.

---

### G — Input and validation

All editable Work fields use explicit metadata from the business/domain layer for:

- required/optional;
- data type;
- allowed range;
- allowed values;
- unit;
- validation rule;
- persistence requirement.

Technical rules:

- use native input types;
- use numeric input for numeric values;
- preserve entered values after validation failure;
- identify the offending field;
- prevent duplicate submissions;
- disable/relabel the primary action while an operation is in flight;
- distinguish validation failure from persistence/sync failure;
- never clear a complete form merely because one field failed;
- make final confirmation explicit where the business workflow requires it.

The implementation must not invent business ranges or formulas.

---

### H — GPS

GPS is a technical capability and status source.

Technical GPS states must be distinguishable:

- unavailable;
- acquiring;
- available;
- degraded/error.

The UI must communicate GPS status without relying on colour alone.

Technical rules:

- capture GPS only when the relevant business event requires it;
- preserve timestamp and coordinate precision in storage;
- enrich driver-facing location events with place names where available;
- never replace authoritative coordinates with an approximate place name in storage;
- do not block unrelated offline work merely because GPS is temporarily unavailable unless the approved business rule explicitly requires GPS;
- record the actual availability/error condition for later inspection.

Business rules determine when GPS is mandatory.

---

### I — Offline and synchronization

Offline operation is a supported capability.

The technical lifecycle is:

**OFFLINE → SAVING ON DEVICE → ONLINE → SYNCING → SYNCED**

A synchronization failure is distinct from local persistence failure.

Technical requirements:

- write operational data locally before relying on remote synchronization where the business operation is designed to be offline-capable;
- make local persistence idempotent;
- prevent duplicate records/submissions during retry;
- queue eligible synchronization work;
- reconcile server/local state explicitly;
- expose sync status without obstructing normal driver work;
- never claim SYNCED before synchronization is confirmed.

Business rules determine which operations are offline-capable.

---

### J — Notifications

Native Android ride notifications are a technical projection of authoritative Work/trip state.

Technical requirements:

- notification lifecycle follows authoritative trip state;
- creation, update, and dismissal are idempotent;
- notification state cannot become an independent source of trip truth;
- notification updates must not mutate business records;
- cancellation and completion must terminate obsolete notifications;
- permission denial is handled gracefully;
- notification content must use the same authoritative trip data as the Work screen.

Driver interruption must follow the approved experience.

---

### K — Overlay synchronization

Overlays are temporary presentation surfaces, not independent sources of truth.

Technical rules:

- the underlying Work/domain state remains authoritative;
- opening an overlay reads current authoritative state;
- saving through an overlay updates the authoritative state;
- the Work composition reacts to the updated state;
- closing an overlay cannot silently discard a committed change;
- stale overlay data must be rejected or refreshed;
- duplicate listeners/subscriptions must be avoided;
- overlay cleanup occurs when the owning operation completes or is cancelled.

---

### L — Accessibility

All Work interactions must provide:

- visible focus;
- logical focus order;
- semantic labels;
- appropriate roles;
- accessible state announcements;
- sufficient contrast;
- comfortable touch targets;
- keyboard accessibility where applicable;
- non-colour-only status communication;
- reduced-motion support;
- an accessible alternative to swipe-only trip actions;
- meaningful error and success announcements.

Dynamic state changes must be communicated to assistive technology without excessive interruption.

---

### M — Keyboard and viewport

The global native-keyboard rule in section 25.1 applies directly to Work.

Additionally:

- short Work forms are viewport-fit and non-scrolling;
- the focused field remains visible;
- the final confirmation remains reachable;
- native keyboard navigation may move between meaningful fields;
- the final field uses an appropriate completion action;
- no custom numeric keypad is introduced;
- safe-area and keyboard insets are handled by the layout;
- scrolling is permitted only when content genuinely requires it.

This applies to fare, odometer, revenue, cancellation, fuel, trip KM, and future Work numeric/text inputs.

---

### N — Responsive behaviour

Work remains one composition across supported viewport sizes.

Responsive implementation may:

- reflow;
- resize;
- change spacing within the frozen token scale;
- reposition supporting information;
- collapse secondary detail;
- adapt control dimensions within accessibility requirements.

Responsive implementation must not:

- create a separate Work design;
- change business workflow;
- hide a required action;
- make a short driver form scroll merely because the viewport is small;
- introduce competing visual hierarchies.

Small-height and keyboard-open viewports are first-class supported conditions.

---

### O — Design-token mapping

Work inherits the global KFE tokens.

Use:

- global background/surface tokens;
- global text hierarchy;
- semantic success/warning/error/info tokens;
- global spacing scale;
- global radii;
- global typography hierarchy;
- global interaction-state treatment;
- global accessibility requirements.

Work may emphasize operational metrics and primary actions through typography, spacing, scale, and restrained semantic colour, but it must not create an independent token system.

---

### P — Explicit prohibitions

The following are frozen prohibitions for canonical Work implementation:

1. Do not restore an historical Work screen as the implementation.
2. Do not use historical screenshots or commits as visual authority.
3. Do not create a second/alternate Work composition.
4. Do not retain compatibility/duplicate Work UI paths.
5. Do not introduce a generic ERP dashboard composition.
6. Do not create card soup.
7. Do not duplicate business calculations in the UI.
8. Do not make notification/overlay state authoritative.
9. Do not make offline capability dependent on a network round trip where the approved business operation is offline-capable.
10. Do not hide required controls behind the native keyboard.
11. Do not use a custom numeric keypad.
12. Do not make a swipe interaction the only accessible way to perform a critical action.
13. Do not claim synchronization or success before the authoritative operation has completed.
14. Do not treat green CI as proof of visual correctness.
15. Do not treat a successful build artifact as proof that the deployed runtime is correct.
16. Do not change business calculations to make a UI implementation easier.
17. Do not silently change workflow because of component/layout convenience.
18. Do not introduce visual patterns that conflict with the frozen Visual DNA without an explicit design decision.

---

### Q — Pixel-perfect acceptance criteria

**Pixel-perfect certainty is a rendered-runtime verification standard, not a source-code assumption.**

For KFE Work, pixel-perfect acceptance means that the production-rendered Work screen conforms to the frozen specification in:

- composition;
- state hierarchy;
- placement;
- spacing;
- typography;
- controls;
- semantic states;
- interaction states;
- responsive behaviour;
- keyboard-safe behaviour;
- accessibility;
- approved transitions;
- absence of prohibited/duplicate UI.

The acceptance evidence chain is frozen as:

**A–Q specification → source implementation → production build → generated assets → deployment → actual deployed runtime → 13-state visual and functional verification → pixel-perfect acceptance**

Verification must inspect the actual deployed Work screen rather than relying only on source, tests, or CI.

The 13 states must be exercised against their approved workflows. Evidence must include the rendered result and the observed transition/feedback for each applicable state.

A build is not visually accepted merely because:

- CI is green;
- TypeScript compiles;
- tests pass;
- an artifact exists;
- the source resembles the specification.

The final acceptance decision remains product owner approval for business workflow and driver experience, plus technical verification that the implementation matches the frozen specification.

---

## Work implementation rule

The implementation sequence is frozen:

**A–Q frozen**
↓
**One canonical Work implementation**
↓
**Wire current approved business behaviour**
↓
**Production build**
↓
**Generated asset verification**
↓
**Deployment**
↓
**Actual deployed runtime**
↓
**13-state visual + functional verification**
↓
**Pixel-perfect acceptance**

No historical Work composition may be substituted at any step.

The implementation may reuse existing domain/business services where they are current and authoritative. Reuse of a service is not reuse of historical UI.

### Work Freeze Record

**KFE Work State Specification — FROZEN**

This specification is the governing contract for the canonical Work composition.

The Work UI is not to be reconstructed from historical screen implementations. Current business behaviour is preserved through authoritative domain/service logic and wired into this single composition.

Any future change to the Work state set, hierarchy, workflow, business calculation, or driver-facing experience requires an explicit product decision. Technical implementation changes that preserve the frozen contract may proceed without creating a new visual composition.
