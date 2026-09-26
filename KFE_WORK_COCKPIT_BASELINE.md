# KFE Work Driver Cockpit — Baseline

**Status:** FROZEN BASELINE — including authoritative swipe-bar contract  
**Purpose:** Baseline UX/interaction architecture for the complete replacement of the KFE Work driver cockpit. This document records the agreed foundation before further refinement.

This baseline is governed by KFE_VISUAL_DNA.md.

## 1. Core Principle

KFE Work is a **driver cockpit**, not a generic ERP dashboard.

The driver should always be able to answer:

> **Where am I in the workflow, and what do I do next?**

The main screen shows the current state, relevant context, and the primary next action. Inputs appear only when KFE actually needs driver input.

## 2. Permanent Shell

The Work shell remains stable:

- Kanishka Enterprises
- GPS status icon
- Work context
- Primary navigation: Work | Timeline | Performance | Admin

Remove the old visible labels:
- Fleet ERP · KFE 2.0
- Local-first

The GPS indicator is icon-first and communicates status without requiring persistent text.

## 3. Three Driver Surfaces

The same KFE operational state may be represented through three coordinated but independent surfaces:

1. **Main KFE Work cockpit** — state, context, required input.
2. **Android operational overlay + existing notification** — active operational information such as Going to Pickup / Trip Active.
3. **KFE swipe bar** — the current primary operational action.

The Android overlay and the swipe bar are independently movable and independently minimisable. Moving or minimising one must not move or minimise the other.

The surfaces represent the same underlying state; they are not separate workflows.

## 4. State-Driven Cockpit

The main Work flow is:

OFFLINE
→ START SHIFT
→ ODOMETER CHECK / GAP GATE
→ ONLINE / READY
→ GO TO PICKUP
→ READY FOR TRIP
→ START TRIP or CANCEL TRIP
→ TRIP ACTIVE
→ END TRIP
→ TRIP COMPLETED / FARE
→ NEXT PICKUP
→ END SHIFT
→ RECONCILIATION
→ SHIFT REVIEW
→ SHIFT ENDED
→ OFFLINE

Only the current operational surface takes primary visual focus.

## 5. Start Shift

When the driver chooses GO ONLINE, KFE opens the Start Shift gate.

### Odometer confirmation

A prefilled current odometer is never treated as confirmed merely because a value exists.

The driver must explicitly acknowledge the current odometer reading before continuing.

### Odometer gap

If a gap exists between the previous recorded odometer and the current odometer:

- KFE calculates the entire gap.
- The driver does **not** type kilometres.
- The driver must classify the **whole gap** as exactly one of:
  - Personal KM
  - Dead KM
- Partial allocation is not allowed.
- The workflow cannot continue until one classification is explicitly selected and confirmed.

The pre-shift gap classification is separate from active-shift distance accounting.

## 6. Active Shift Distance Model

There is **no Personal KM capture during the active shift**.

For the actual shift:

**TOTAL SHIFT KM → TRIP KM + DEAD KM**

Total Shift KM is based on start and closing odometer.

Trip KM is normally KFE-recorded. The driver may optionally enter trip KM; when explicitly supplied, the driver's trip KM can be authoritative for the relevant reconciliation/calculation while the original KFE-recorded value remains available.

Dead KM is derived from the applicable shift-distance reconciliation.

Personal KM applies only to the pre-shift odometer-gap classification.

## 7. Mandatory Input Gate

A compulsory field cannot be ignored or bypassed.

For every mandatory operation:

**Input → validation → explicit confirmation → state transition**

A driver cannot advance through a required field by:
- leaving it blank,
- swiping past it,
- navigating away,
- tapping outside the form,
- treating a prefilled value as automatically confirmed,
- or using an otherwise available shortcut.

Validation must clearly explain what is required and preserve useful input.

Prefilled value ≠ acknowledged value.

## 8. Going to Pickup

Going-to-pickup operational context is shown in the configured Android overlay and notification rather than occupying the main Work screen as a large card.

Example information:

- GOING TO PICKUP
- GPS status
- Dead KM
- Pickup in progress

GPS, timestamp, and movement information are captured automatically where available.

The KFE swipe bar is the authoritative primary action surface corresponding to the current state.

## 9. Ready for Trip

At pickup, the main cockpit provides the trip setup required before starting:

- Operator selection, when required.
- START TRIP swipe action.
- CANCEL TRIP action.

Cancellation is available at this decision point.

Once START TRIP is performed, the cancellation option disappears on the next state.

## 10. Trip Cancellation

If the driver chooses CANCEL TRIP:

- Required cancellation reason is entered.
- Required cancellation fare/data is entered where applicable.
- Mandatory fields cannot be bypassed.
- KFE records the cancellation event and automatic context such as time/GPS where available.
- After successful cancellation confirmation, the driver returns directly to the main KFE state before going for the next pickup.

Cancellation is not a separate end-of-shift reconstruction task.

## 11. Trip Active

During an active trip, the Android overlay and existing notification carry operational context such as:

- TRIP ACTIVE
- operator
- timer
- trip KM
- GPS/status where appropriate

The independent KFE swipe bar provides the authoritative END TRIP action.

The driver should not need to type routine tracking information during the active trip.

## 12. Trip Completion

After END TRIP:

- KFE records trip completion automatically.
- Driver enters the trip fare.
- Fare is compulsory where the business rule requires recorded revenue.
- The driver cannot proceed without required fare information.

Trip KM entry is optional.

If the driver provides trip KM, that value may become authoritative for the relevant calculation/reconciliation. If not provided, KFE-recorded trip KM remains the basis.

## 13. Refuelling

Refuelling is a secondary action accessed through the fuel icon rather than a permanently visible Add Refuelling block.

The form contains:

- Odometer — blank initially and fat-finger safe.
- Price / kg.
- Amount.
- Quantity — automatically calculated as Amount ÷ Price/kg.
- OK.

The odometer input must use a large, touch-safe numeric control and cannot silently assume a prefilled value.

Fuel timestamp and GPS/place are captured automatically where available.

The form can be opened/closed through the fuel icon, and OK closes a completed entry.

## 14. End Shift

The driver uses OFFLINE to initiate End Shift only when there is no active trip.

The first end-shift surface asks for information that becomes known at shift closure:

- Closing odometer — required.
- Shift revenue — required.
- Business toll — optional where applicable.
- Business parking — optional where applicable.

Start odometer is displayed as context, not re-entered.

The driver cannot advance past required closure fields.

After closure data is captured, KFE calculates/reconciles the shift distance.

## 15. End-Shift Reconciliation

The driver should not be forced to review every trip.

Revenue reconciliation is **exception based**:

- If all completed trips have recorded revenue, show a simple all-clear state.
- If some completed trips have no recorded revenue, show **only those trips** for reconciliation.
- The driver enters the missing revenue for those trips.
- Already-reconciled trips remain out of the primary reconciliation workflow.

Separately, the driver may optionally review and enter authoritative trip KM for individual trips. This is not mandatory for every trip.

## 16. Shift Review

After required reconciliation, KFE presents a concise shift summary including, as applicable:

- Trips
- Cancellations
- Total Shift KM
- Trip KM
- Dead KM
- Revenue
- Business toll
- Business parking
- Fuel

This is primarily a review/confirmation surface, not another data-entry form.

## 17. Shift End

After confirmation:

- Show SHIFT ENDED.
- Show concise completion summary.
- OK completes the flow.
- The driver returns directly to OFFLINE.

The driver must not have to press OFFLINE again after completing End Shift.

## 18. Driver Input Philosophy

**Input is event-based, not form-based.**

Driver inputs occur when the information becomes known:

- Start shift → confirm current odometer.
- Pre-shift gap → choose whole gap as Personal KM or Dead KM.
- Trip setup → operator, when required.
- Trip cancellation → cancellation details.
- Trip completion → fare.
- Optional trip review → authoritative trip KM.
- Refuel → odometer, price/kg, amount.
- End shift → closing odometer and required shift revenue.
- End-shift expenses → optional business toll/parking.
- Reconciliation → only missing revenue entries.

Everything KFE can reliably capture should be automatic.

## 19. UX Rule

The driver should spend as little time as possible entering data.

The cockpit follows:

**Current state → relevant information → one obvious next action**

Forms appear only when necessary, mandatory information is gated, and completed information is not unnecessarily requested again.

## 20. Authoritative Swipe Bar

The KFE swipe bar is a **critical, authoritative touch surface** for the driver's primary operational transitions.

### 20.1 Authoritative actions

There are exactly three operational swipe actions:

1. **GO TO PICKUP**
2. **START TRIP**
3. **END TRIP**

The swipe bar represents the single primary action available in the applicable operational state.

It is not a generic Continue button.

### 20.2 Shared physical interaction

All three actions use the same physical interaction and the same rightward direction:

**Grab handle → drag right → cross threshold → RELEASE → authoritative commit → state transition**

The motor pattern must remain consistent across states.

### 20.3 Geometry

The bar is a large rounded/pill-shaped track with a large movable handle.

Target geometry:

- Bar height: approximately **64–72 px**.
- Handle: approximately **56–60 px**, with a minimum effective touch target of **64 × 64 px**.
- Comfortable horizontal margins.
- Large, high-contrast handle and directional cue.
- The handle nearly fills the bar vertically.
- The control is visually prominent without becoming decorative.

The exact final pixel geometry may be tuned during implementation/testing without changing the interaction contract.

### 20.4 Handle and hit area

The handle is the primary gesture-start area.

A generous invisible touch halo around the handle may start the gesture to make it fat-finger safe.

Touching the distant track/text area must not accidentally initiate an authoritative swipe.

A simple tap or very small movement does nothing.

### 20.5 Finger tracking

Once initiated:

- Handle movement follows the driver's finger approximately 1:1.
- Small vertical movement is ignored.
- The gesture is horizontally locked.
- The handle cannot visually leave its permitted travel area.
- Movement outside the permitted horizontal range is clamped safely.

### 20.6 Scroll interaction

If touch begins on the swipe handle/hit halo, the swipe gesture has priority over page scrolling.

If touch begins outside the swipe handle/hit halo, normal page scrolling remains available.

The entire Work screen must not become scroll-locked merely because the swipe bar exists.

### 20.7 Threshold

The initial interaction target is approximately **70% of usable handle travel**.

The threshold must be deliberate but comfortable:

- Too early risks accidental activation.
- Too late creates excessive thumb travel.

The exact implementation value may be tuned through real-device testing while preserving the deliberate-threshold principle.

### 20.8 Threshold feedback

The bar progresses through clear interaction states:

**Idle**
→ action label

**Swiping**
→ visual progress

**Threshold reached**
→ **RELEASE TO [ACTION]**

The threshold state is reached before release.

Simply reaching the threshold while the finger remains down does **not** commit the action.

### 20.9 Commit point

The authoritative commit point is:

**Threshold reached + driver releases**

Only then does KFE execute the operational command.

Example:

**START TRIP → RELEASE TO START → release → STARTING TRIP… → TRIP ACTIVE**

Equivalent sequences apply to GO TO PICKUP and END TRIP.

There is no second confirmation dialog/button after a successful authoritative swipe.

### 20.10 Early release

If the driver releases before the threshold:

- No operational action occurs.
- No state transition occurs.
- No mutation is created.
- The handle smoothly returns to its starting position.
- No unnecessary error/confirmation message is required.

### 20.11 Backward movement

The driver may move backwards during the gesture.

If the handle falls below the threshold:

- The release-to-commit state disappears.
- Releasing below the threshold does nothing.
- The gesture remains safe and reversible until the actual commit point.

### 20.12 Validation and authority

The swipe is authoritative **only for an allowed transition**.

The underlying command must validate the current KFE state and all mandatory business requirements before committing.

The swipe must never bypass:
- missing mandatory information,
- invalid state,
- required operator selection,
- required trip/fare data,
- or any other applicable business gate.

The command path is:

**Gesture → validation → commit → persisted operational state → UI/overlay/notification update**

### 20.13 Duplicate protection

Once the commit begins:

- The swipe surface becomes temporarily locked.
- A second swipe cannot submit the same operation.
- Duplicate operational mutations/events/notifications must be prevented at the underlying mutation layer as well as the UI layer.

### 20.14 Interruption and recovery

The persisted operational state is authoritative, not the animation.

If the app is interrupted after a swipe:

- If the command committed, reopening KFE must show the resulting state.
- If the command did not commit, reopening KFE must show the previous state.
- KFE must never infer that an operation happened merely because a swipe animation started or progressed.

### 20.15 Offline behavior

The swipe does not inherently require network connectivity.

Where the underlying business operation is permitted offline, the authoritative command is committed locally and the operational state changes locally.

GPS/network availability remains a separate status concern.

### 20.16 Accessibility

An accessible equivalent action must be available for drivers who cannot perform the gesture.

The alternative action must invoke the **same authoritative command path**, with the same validation, business rules, persistence, and state transition as the swipe.

It must not create a separate operational workflow.

### 20.17 Relationship to Android overlay and notification

The Android overlay and existing notification remain independent operational surfaces.

The swipe bar and overlay/notification:
- represent the same underlying KFE operational state,
- may be moved/minimised independently,
- must never move/minimise one another,
- must not create duplicate workflows,
- and must remain synchronized with the authoritative persisted state.

### 20.18 GPS/network independence

**The swipe action must never be blocked, delayed, or made dependent on GPS.**

GPS, location resolution, place-name resolution, network connectivity, and other background telemetry are supporting/background services.

For an otherwise valid operational transition:
- GPS unavailable must not prevent the swipe from committing.
- Internet unavailable must not prevent an operation that is permitted offline.
- Slow GPS/network response must not hold the swipe in a waiting state.
- Missing GPS data is recorded as unavailable where applicable; it is not a reason to make the driver wait for the swipe action.

The authoritative operational command and background telemetry are separate concerns.

### 20.19 Identical PWA and Android overlay swipe experience

The **PWA swipe bar and Android overlay swipe bar must have exactly the same interaction feel**.

This includes the same:
- handle behavior,
- touch target/hit area,
- rightward gesture,
- finger tracking,
- threshold behavior,
- release-to-commit behavior,
- early-release behavior,
- backward movement behavior,
- gesture locking,
- feedback timing,
- disabled/committing behavior,
- and completion semantics.

They are two surfaces for the same authoritative command, not two differently designed swipe controls.

Visual language and hierarchy for the swipe bar are deliberately **not frozen here**. Those will be designed as part of the complete Work screen experience.

### 20.20 Background, screen-off, and lifecycle resilience

The authoritative operational state must not depend on the PWA page remaining visibly open.

Where the platform permits the relevant surface/operation to remain active:
- the operational state must continue to be driven by the persisted KFE state;
- background execution must not silently create a different workflow;
- screen-off must not corrupt or reset the current operational state;
- returning to the app must restore the last authoritative state rather than reconstructing state from UI animation.

The swipe command must complete/persist before being considered authoritative. If interrupted before persistence, it must not be treated as committed.

### 20.21 Restart and crash recovery

After:
- app restart,
- PWA reload,
- Android process recreation,
- phone restart,

KFE must restore and show the **last persisted authoritative operational state**.

It must not default back to OFFLINE merely because the UI/process restarted.

If an operation was successfully persisted before interruption, the corresponding state must be restored.

If it was not persisted, KFE must not invent a transition.

### 20.22 Pending-command safety

A swipe command must have a clear transactional outcome:

**not committed** or **committed**.

A partially animated or interrupted gesture is never itself a business event.

If the implementation uses an intermediate/pending command state, recovery must resolve it deterministically without creating duplicate operational events.

### 20.23 State synchronization

PWA Work, Android overlay, Android notification, and any other operational representation must derive their displayed state from the same persisted operational state.

One surface must not independently assume a transition succeeded while another says it did not.

### 20.24 Universal platform behavior

Existing KFE-wide rules for persistence, lifecycle handling, offline/local-first operation, notifications, accessibility, and platform recovery continue to apply.

This swipe-bar contract **adds only the swipe-specific requirements above**; it does not replace or duplicate universal KFE behavior.

## 20.25 Work Viewport Functional Foundation

The Work screen functional foundation is frozen before visual styling.

The viewport must support these functional areas:

1. **Current operational state** — the driver can always see where they are in the workflow.
2. **Driver Target** — today's target, current progress, and progress toward target.
3. **Operational timer** — displayed in frozen KFE `hh mm ss` format and derived from authoritative persisted timestamps/state.
4. **State-specific context/forms** — only information relevant to the current operational state is presented.
5. **Permanent swipe-bar zone** — reserved immediately above the bottom navigation/menu.
6. **Bottom navigation/menu** — remains structurally separate from the swipe-bar zone.

The Work content must never be hidden behind the permanent swipe-bar zone. The layout must reserve the required space so content, forms, controls, lists, and messages can reach their usable bottom without being obscured.

The swipe bar is not a floating overlay that covers content; its place in the viewport is structurally reserved.

### Driver Target and progress

The Driver Target is a Work-level operational indicator.

It must:
- show the applicable daily target;
- show current achieved/progress value;
- show progress toward the target;
- update from persisted authoritative operational data;
- remain usable in offline/local-first operation where the underlying data is locally available;
- survive reload/background/process restart by deriving its display from persisted state rather than a transient UI counter.

Target progress is not an additional operational workflow and must not interfere with the authoritative swipe action.

### Operational timer

The Work timer uses the frozen KFE display format:

**`hh mm ss`**

The displayed timer must be derived from authoritative persisted timestamps/state rather than from the lifetime of the currently visible UI.

It must recover correctly after:
- backgrounding,
- screen-off,
- PWA reload,
- Android process recreation,
- phone restart.

Timer recovery must never invent an operational transition.

## 20.26 Driver Cockpit Shift Toggle

The Work cockpit has a persistent **Driver Cockpit shift-level toggle**:

**OFFLINE | ONLINE**

A fuel icon is a separate secondary action associated with the cockpit.

The toggle is distinct from the authoritative swipe bar.

### OFFLINE → ONLINE

Choosing ONLINE opens the Start Shift gate when required.

The toggle must not bypass:
- current odometer acknowledgement;
- pre-shift odometer-gap classification;
- mandatory validation;
- explicit confirmation;
- persisted shift-start state.

Only after the required Start Shift gate successfully validates and commits does the shift become ONLINE.

### ONLINE → OFFLINE

Choosing OFFLINE initiates End Shift only when there is no active trip.

The toggle must not bypass:
- active-trip protection;
- closing odometer;
- required shift revenue;
- applicable validation;
- reconciliation;
- shift review;
- persisted shift-end state.

After successful End Shift confirmation, KFE returns directly to OFFLINE. The driver must not have to press OFFLINE a second time.

### Toggle authority

The toggle is a shift-level control, not a replacement for the three authoritative operational swipe actions:

1. GO TO PICKUP
2. START TRIP
3. END TRIP

The toggle and swipe bar represent different levels of the same persisted KFE operational state and must remain synchronized with that state.

The toggle must follow the existing KFE rules for:
- offline/local-first operation;
- persisted state authority;
- duplicate protection;
- validation before commit;
- interruption/recovery;
- lifecycle and restart recovery.

It must not create a parallel workflow or infer state from transient UI appearance.

## 20.27 Functional Work-Cycle Foundation

The frozen functional Work cycle is:

**OFFLINE**
→ **START SHIFT**
→ **ODOMETER CONFIRMATION**
→ **PRE-SHIFT GAP: PERSONAL KM or DEAD KM**
→ **ONLINE / SHIFT READY**
→ **GO TO PICKUP**
→ **GOING TO PICKUP**
→ **READY FOR TRIP**
→ **OPERATOR, when required**
→ **START TRIP** or **CANCEL TRIP**
→ **TRIP ACTIVE**
→ **END TRIP**
→ **TRIP COMPLETED / FARE**
→ **NEXT PICKUP**
→ repeat operational cycle
→ **END SHIFT**
→ **CLOSING ODOMETER + SHIFT REVENUE**
→ **EXCEPTION-BASED RECONCILIATION**
→ **OPTIONAL END-SHIFT EXPENSES**
→ **SHIFT REVIEW**
→ **SHIFT ENDED**
→ **OK**
→ **OFFLINE**

Supporting forms remain event-based and appear only when their information becomes necessary:
- Start Shift: current odometer acknowledgement and pre-shift gap classification.
- Trip setup: operator when required.
- Cancellation: required cancellation details.
- Trip completion: required fare and optional trip KM.
- Refuelling: odometer, price/kg, amount, automatic quantity calculation, OK.
- End Shift: closing odometer, required shift revenue, optional business toll/parking.
- Reconciliation: only missing revenue.
- Shift Review: review/confirmation, not unnecessary data entry.

This functional foundation is frozen independently of visual styling.

## 20.28 Work Native Keyboard + Keyboard-Safe Input Rule

**FROZEN**

The Work cockpit inherits the global KFE native-keyboard rule from KFE Visual DNA.

All Work text/numeric input uses the device-native keyboard and appropriate native input types. Custom numeric keypads are not permitted unless explicitly approved as a future design change.

When the native keyboard opens, the Work layout must adapt to the reduced visible viewport.

The active input and all controls required to complete the current interaction must remain accessible. Nothing required may be hidden underneath the keyboard.

Short Work driver forms are **viewport-fit and non-scrolling** while the keyboard is open, including:

- trip fare entry;
- trip cancellation entry and confirmation;
- CNG refuelling;
- odometer entry;
- shift revenue;
- closing odometer;
- other short numeric/text driver inputs.

The implementation may reflow, resize, reposition, or otherwise adapt the form to the keyboard-open viewport, but must not introduce form scrolling merely to work around keyboard occlusion.

Scrolling remains allowed for genuinely long dynamic content, such as a long reconciliation exception list, where scrolling is required by the amount of content rather than by keyboard handling.

This rule is part of the frozen Work foundation and must be verified on real device/PWA keyboard-open states during implementation.


## 20.29 Work Visual Direction — Premium Instrument

**FROZEN**

The Work cockpit uses the **Premium Instrument** visual direction.

KFE Work should feel like a professional driver's digital cockpit / vehicle instrument system rather than a generic ERP dashboard.

The visual character is:

- driver-centric;
- easy to understand at a glance;
- mistake-resistant;
- modern;
- sophisticated;
- professional;
- calm when normal;
- visually assertive only when driver action or attention is required.

The core attention sequence is:

**Glance → Understand → Decide → Act → Confirm → Continue**

The cockpit is a coherent instrument surface rather than a collection of unrelated cards.

### Visual hierarchy

The Work screen prioritizes:

1. **Target / progress**
2. **Operational timer**
3. **Current state**
4. **State-specific operational content**
5. **Supporting information**

The Target and Timer receive greater visual importance and space than Current State. Current State remains prominent but compact.

The screen must always make the current operational situation and the next meaningful action obvious without requiring the driver to hunt through the interface.

### One obvious primary action

Every Work state must have one visually obvious primary action.

Two actions must not receive equal visual weight when only one is the normal next action.

The interface should constrain invalid or unnecessary actions rather than relying primarily on warnings after mistakes.

### Visual restraint

Premium Instrument does not mean decorative.

Avoid:

- excessive cards;
- card soup;
- excessive pills;
- heavy shadows;
- unnecessary gradients;
- decorative animation;
- oversized labels;
- visual noise.

Hierarchy should come primarily from typography, spacing, contrast, surfaces, restrained borders, and purposeful controls.

### Typography

Work uses the shared KFE typography system with a strong numerical/instrument hierarchy.

Important operational numbers may be visually stronger than their labels.

Major numeric instruments such as target and timer use deliberate display sizing and stable/tabular numeral behaviour where supported.

Typography weight is restrained:

- regular for normal information;
- medium for labels/secondary emphasis;
- semibold for states/actions;
- bold for major instruments and critical information.

Uppercase is used selectively for compact section labels and operational identities, not for long instructions.

### Shape language

Work uses a soft but precise shape language:

- small controls: approximately 10–12px radius;
- inputs: approximately 12–16px;
- cards/major surfaces: approximately 16–20px;
- major containers: approximately 20–24px where appropriate;
- authoritative swipe interaction: strongly rounded/pill-shaped.

The swipe bar remains visually distinct as the special tactile operational control. Ordinary buttons should not become full pills merely for decoration.

Not every piece of information becomes a card. Surfaces exist when they communicate meaningful grouping, relationship, state, or action.

### Local-change architecture

The Work visual implementation must preserve **local change → local effect**.

Visual components should have clear boundaries so that a future adjustment to one component does not unnecessarily alter unrelated components or operational behaviour.

Examples:

- changing timer size affects timer presentation only;
- changing header placement affects header layout only;
- moving the shift toggle affects toggle placement only;
- removing/adding helper text affects that supporting content only;
- changing an input's visual size does not change its data logic.

Structural changes that genuinely require broader layout changes may affect more than one component, but must remain isolated from business/state logic wherever possible.

Visual changes must never silently change operational behaviour.

## 20.30 Work Semantic Colour Direction

**FROZEN**

Work uses semantic, restrained colour coding.

Colour communicates meaning rather than decoration.

The shared KFE semantic system is used for:

- neutral/offline;
- active/in-progress;
- ready/healthy;
- attention;
- error/destructive;
- completed/success;
- disabled/unavailable.

Colour must never be the sole carrier of meaning. Text, iconography, shape, structure, or state labels must reinforce important meanings.

The Work cockpit should remain predominantly neutral when everything is normal. Semantic colour becomes more visually assertive when the driver needs attention or action.

Light, Dark, Auto, and future themes must derive these meanings from semantic theme tokens rather than hard-coded component-specific colours.

## 20.31 Work Spacing and Viewport Direction

**FROZEN**

Work uses the shared KFE spacing scale and intentional hierarchy.

Related information uses tighter spacing. Major instruments and state transitions use deliberate larger separation.

The viewport is structured as:

**Shell → cockpit instruments → current state → flexible dynamic operational area → reserved swipe zone → bottom navigation**

The permanent swipe zone and bottom navigation remain structurally reserved. Dynamic content must not be hidden underneath them.

The dynamic operational area absorbs available space and may adapt its layout to the current viewport.

Keyboard-open layouts must continue to follow the frozen native-keyboard and keyboard-safe viewport rules.

## 20.32 Work Component Anatomy

**FROZEN**

The Work visual system uses a small reusable component vocabulary rather than isolated screen-specific styling.

Core visual components include:

- Shell / Header;
- Driver Cockpit title;
- Shift-level OFFLINE | ONLINE control;
- Fuel secondary action;
- Target Instrument;
- Timer Instrument;
- Current State;
- State-specific operational content;
- Driver Input;
- Choice Input;
- Primary action;
- Secondary action;
- Automatic Context;
- Success state;
- Exception/Attention state;
- Authoritative Swipe Action;
- Bottom Navigation.

### Target Instrument

The Target Instrument is a major operational readout.

Its hierarchy is:

**current achieved value → target value → percentage/progress → remaining value**

The achieved value is visually dominant. Progress is immediately understandable without requiring detailed reading.

### Timer Instrument

The timer is a major operational readout with stable, highly legible numerals.

It follows the frozen KFE operational time display rules and derives from authoritative persisted state/timestamps.

### Current State

Current State is visually prominent but compact relative to Target and Timer.

It communicates the driver's present workflow position and should not consume unnecessary vertical space.

### Driver Input

Driver inputs are large, touch-safe, modern, simple, and visually focused.

Labels remain visible. Numeric values are dominant. Units are subordinate.

Focused inputs have a clear, accessible focus treatment.

### Choice Input

Where a driver chooses between alternatives, the meaningful selection row is tappable as a whole rather than requiring precision on a small radio/control.

### Primary and secondary actions

Primary actions have clearly greater visual weight than secondary actions.

Button labels use meaningful operational verbs rather than generic form language where possible.

### Automatic Context

Automatically captured information such as GPS, place, timestamp, and system-derived values is visible enough to establish confidence but visually subordinate to driver-entered operational information.

### Success and exception states

Success feedback is concise and reassuring.

Exception states clearly identify what requires attention and provide the obvious next action.

## 20.33 Dual Input Navigation

**FROZEN**

Short multi-entry Work forms support both:

1. **Direct field tapping** — the driver may tap any editable field and continue using the native keyboard.
2. **Native keyboard action navigation** — the keyboard provides an appropriate action such as **Next** to move focus directly to the next editable field without requiring the driver to tap it.

When Next is used:

- the current field is handled according to normal input/validation rules;
- focus moves to the next meaningful editable field;
- the native keyboard remains open;
- the newly focused field is brought into the active visible viewport;
- no unnecessary keyboard dismissal/reopening occurs.

For the final editable field, the native keyboard action should use an appropriate final action such as **Done** (or an explicitly appropriate final action where approved).

Keyboard actions must not bypass KFE's mandatory explicit-confirmation or business-rule gates.

Example:

**Fuel: Odometer → Next → Price/kg → Next → Amount → Done → OK**

The driver may alternatively tap fields in any supported order.

This rule applies to short Work forms including fuel, fare, cancellation, odometer, shift revenue, closing odometer, and future multi-entry driver forms where sequential navigation is meaningful.

## 20.34 Refinement / Implementation Boundary

**FROZEN**

The above Work visual direction is a design specification, not an implementation instruction.

The complete Work visual system is to be implemented **universally across the Work experience when implementation is approved**, rather than being implemented as isolated visual experiments for only selected states.

Future visual refinement may adjust component placement, size, spacing, helper text, or other presentation details without reopening the entire design system when the requested change remains within the frozen visual language.

A future refinement that conflicts with a frozen rule must raise:

**DESIGN DRIFT / CONFLICT WARNING**

before implementation.


## 21. Baseline / Further Refinement

This document is the **frozen baseline**, including the authoritative swipe-bar contract.

Further design refinement may add detail and new agreed behaviour.

Existing baseline rules must not be silently removed, weakened, or contradicted. If a future refinement conflicts with this baseline or KFE_VISUAL_DNA.md, explicitly raise:

**DESIGN DRIFT / CONFLICT WARNING**

No implementation is implied by this document. It records the agreed design foundation only.


## 20.35 Driver-Centric Interaction Refinement Layer

**FROZEN**

This refinement layer extends the frozen Work interaction system with small, high-impact behaviours intended to make routine driver operation smooth, predictable, mistake-resistant, and low-friction.

These refinements do not redesign the Work cockpit or change business rules. They refine how the existing workflow is entered, confirmed, completed, interrupted, and recovered.

### Universal short-form input lifecycle

Short driver forms follow a consistent interaction grammar:

**Focus → Enter → Validate → Next → Confirm → Commit → Success → Next State**

The exact sequence may shorten where a field or form does not require every stage, but the driver must always understand what has been entered, what remains required, what has been confirmed, and what happened after commit.

Native keyboard actions may accelerate movement between fields but must never bypass explicit KFE confirmation or business-rule gates.

### Native input selection

Use the most appropriate native input type for each field:

- numeric values use the appropriate native numeric/decimal input;
- text values use the native text keyboard;
- selection/reason fields use the appropriate native selector where applicable.

KFE must not force drivers to type units, currency symbols, or other formatting that the interface can provide itself.

### Keyboard action semantics

For sequential short forms:

- **Next** moves to the next meaningful editable field;
- the keyboard remains open;
- the next field remains visible;
- **Done** is used on the final editable field when appropriate;
- keyboard actions never become an implicit substitute for mandatory explicit confirmation.

The field order must be deliberate and match the natural information-entry sequence.

### Focus and auto-focus

Direct field tapping remains supported at all times.

Auto-focus is used only where it clearly reduces driver effort and does not unexpectedly open the keyboard during a state transition.

A state transition must never surprise the driver by moving focus or opening the keyboard without a clear interaction reason.

### Prefill and acknowledgement

KFE may prefill values that it knows reliably, but:

**Prefilled value ≠ acknowledged value.**

Where explicit acknowledgement is required, the driver must still acknowledge the value even when it is already present.

### Units and numeric editing

Units are displayed as part of the interface rather than requiring driver entry.

Numeric fields should make correction easy and should not require unnecessary deletion/re-entry of an entire value.

The visual treatment must make the editable value, unit, and any calculated value clearly distinguishable.

### Validation and error recovery

Validation should occur at the natural point for the operation.

When an error occurs:

- preserve useful values already entered;
- clearly identify the actual problem;
- move focus to the relevant field where appropriate;
- do not force the driver to re-enter unrelated correct values.

### Post-action destination

Every completed operational action has an explicit post-action destination.

The driver should never be left wondering:

> **Did that work, and what do I do now?**

Examples:

- Fuel → successful save → fuel form closes → cockpit remains in the applicable state.
- Cancellation → successful confirmation → cancellation surface closes → next applicable operational state.
- End Shift → closure → reconciliation → review → confirmation → OFFLINE.

A successful action should automatically return the driver to the next useful operational context unless a deliberate review/confirmation stage is required.

### Success feedback

Success feedback is short, local, and reassuring.

It should confirm completion without creating an unnecessary extra tap.

Where the workflow already requires a review or explicit OK, success feedback must not replace that required step.

### Back behaviour

Back has predictable semantics.

Where safe, Back cancels/closes the current temporary form or draft without changing the authoritative operational state.

Back must never silently discard meaningful entered information when that would create an unexpected loss.

Back must never bypass a mandatory business gate or manufacture an operational transition.

### Draft preservation

If a form can safely be left temporarily, useful draft values may be preserved.

Draft preservation must never be confused with an authoritative business commit.

Stale or unsafe operational commands must not be restored merely because a draft existed.

### Swipe/action recovery

An incomplete authoritative swipe:

- does not create a business event;
- returns safely to its idle state;
- does not create an ambiguous intermediate workflow.

After commit begins, duplicate protection applies at both UI and mutation layers as already frozen.

### Double-action protection

Rapid repeated taps, repeated keyboard actions, or repeated swipes must not create duplicate operational mutations.

The committing surface should provide a small local committing state while the underlying mutation layer remains authoritative.

The whole cockpit should not freeze merely because one local action is committing.

### Local loading and commit feedback

During an operation that requires persistence:

- indicate the local action is committing;
- prevent duplicate submission;
- keep unrelated cockpit context stable where possible;
- update the authoritative state as soon as the commit succeeds.

Loading feedback should be local to the action rather than an unnecessary full-screen loading state.

### Offline confidence

Where an operation is permitted offline, the driver should be able to tell that the operation has been accepted locally without waiting for network connectivity.

Network state must not create uncertainty about whether a locally permitted operational action was committed.

Offline is a capability, not an error state.

### GPS independence

GPS availability remains separate from operational command availability.

If an otherwise valid action does not require GPS to commit, weak/unavailable GPS must not block or delay it.

Where GPS/place data is unavailable, KFE records or displays that limitation appropriately rather than making the driver wait.

### State-transition continuity

After every completed action, the cockpit should immediately present:

**Current state → relevant context → next useful action**

The driver should not need to search through cards, menus, or secondary information to discover what happens next.

### Zero-hunting principle

**FROZEN**

At every operational state, the driver should not have to hunt for the next action.

The interface should make the normal next step visually obvious while keeping secondary/supporting information subordinate.

This is an extension of the core KFE rule:

**Current state → relevant information → one obvious next action**

### Driver attention budget

**FROZEN**

The Work cockpit should distinguish between information that requires attention now and information that is merely useful.

**Must notice now**
- current operational state;
- target/progress;
- operational timer;
- primary action;
- mandatory input;
- active exception/error.

**Useful when needed**
- GPS status;
- fuel access;
- secondary operational context;
- supporting figures.

**Should not interrupt routine operation**
- historical information;
- detailed reconciliation information before it is needed;
- administrative metadata;
- information that does not affect the current decision.

Normal operation remains visually calm. Attention is deliberately amplified only when the driver needs to decide or act.

### Mistake-proofing review

Each Work state must be reviewed against the question:

> **What is the most likely driver mistake here, and can the interface prevent it instead of merely warning about it afterwards?**

Examples include:

- preventing Start Shift from bypassing odometer acknowledgement or gap classification;
- preventing active-trip End Shift;
- removing cancellation once a trip has started;
- keeping optional end-shift fields visually subordinate to mandatory closure fields;
- limiting each state to valid/meaningful actions.

The preferred solution is to constrain invalid actions rather than depend on warning dialogs after the mistake has already occurred.

### Interruption and recovery continuity

The driver may leave the PWA temporarily because of:

- phone lock;
- incoming call;
- app switch;
- network loss;
- GPS loss;
- PWA reload;
- browser refresh;
- viewport/orientation change;
- background/process suspension.

On return, KFE must restore the authoritative persisted operational state and the appropriate current context.

The driver should return to the operational truth, not merely to the last visible screen.

Transient UI animation, focus, or partially entered visual state must never be treated as evidence that an operational transition committed.

### Routine-operation scroll discipline

Routine Work operations should remain scroll-minimized.

The normal path through a short driver operation should fit the active viewport, including the keyboard-open state where applicable.

Internal scrolling is reserved for genuinely dynamic content whose size requires it, such as a long reconciliation exception list.

Scrolling must not become a substitute for poor viewport or keyboard handling.

### Touch safety

Operational touch targets must remain comfortably usable with one hand and imperfect touch precision.

Primary actions, choice rows, fields, and the swipe handle must have sufficient effective touch area.

Small decorative controls must not become the only way to perform a required operational action.

### Choice safety

Where the driver chooses between alternatives:

- the meaningful choice row remains tappable as a whole;
- selected/unselected states are immediately understandable;
- the control does not depend on precise tapping of a tiny radio/checkbox;
- the selected choice remains visible through confirmation where confirmation is required.

### Helper-text discipline

Helper text exists only when it helps the driver understand the current decision or avoid a mistake.

Once the interaction is self-explanatory, redundant instructional text should not consume cockpit space.

Removing helper text is a visual refinement only and must not remove required business information.

### Form simplicity rule

Every driver form should ask:

1. What does KFE already know?
2. What must the driver provide?
3. What can be calculated automatically?
4. What must be explicitly confirmed?
5. What should happen immediately after success?

The form should contain only what is necessary for that event.

### Universal refinement principle

These refinements are part of the frozen Work interaction language.

They apply to existing and future short driver forms and operational states unless a specific state has a documented reason to behave differently.

Any exception must be deliberate, documented, and consistent with KFE Visual DNA and the Work baseline.

## 20.36 Work State-by-State Interaction Audit Gate

**FROZEN**

Before implementation of the refined Work cockpit is considered complete, each operational state must be checked against the same interaction audit:

**Entry → State identity → Relevant information → Inputs → Keyboard behaviour → Validation → Confirmation → Commit → Success → Post-action destination → Next action → Interruption/recovery → Mistake prevention**

The audit applies to:

**OFFLINE → Start Shift → Odometer/Gap Gate → Online/Ready → Go to Pickup → Going to Pickup → Ready for Trip → Trip Active → Trip Completion → Next Pickup → End Shift → Reconciliation → Shift Review → Shift Ended**

A state is not considered interaction-complete merely because its normal path works.

The review must also verify:

- direct field tapping;
- native keyboard navigation where applicable;
- keyboard-safe viewport;
- back/cancel behaviour;
- duplicate-action protection;
- offline behaviour;
- GPS independence where applicable;
- success feedback;
- correct post-action destination;
- reload/background/process recovery;
- clear next action;
- prevention of likely driver mistakes.

This audit is a refinement/verification gate, not permission to change frozen business rules.

## 20.37 Refinement Freeze Boundary

**FROZEN**

The interaction refinements in sections 20.35–20.36 are now part of the Work baseline.

They refine the experience without changing:

- the frozen operational state machine;
- the authoritative swipe-bar contract;
- the shift-level OFFLINE | ONLINE toggle;
- the native keyboard/keyboard-safe viewport rule;
- the Premium Instrument visual direction;
- the KFE Visual DNA.

Implementation must treat these refinements as governing requirements.

Any later proposal that changes these rules must explicitly identify the affected frozen rule and raise:

**DESIGN DRIFT / CONFLICT WARNING**

before implementation.


## 20.38 Work Visual System Completeness & Editability Freeze

**FROZEN**

This section completes the visual-system specification for the new Work replacement. It does not change the frozen Work workflow, business rules, calculations, authoritative state model, or swipe contract.

The new Work implementation must be built as a **new replacement presentation layer**, using the frozen workflow and business/data capabilities as its foundation. The old Work screen is reference material for understanding existing business meaning only; its presentation, layout, custom interaction patterns, and implementation are not governing requirements for the replacement.

### 20.38.1 Token and component architecture

Visual styling must be driven by shared KFE design tokens and reusable Work components.

Tokens govern, as applicable:
- typography;
- spacing;
- radii;
- borders;
- semantic colours;
- surfaces;
- elevation;
- control heights;
- focus treatment;
- motion;
- responsive sizing.

Reusable components must own their presentation rules locally.

A visual change to one component should not require unrelated component changes and must not alter business/state logic.

Business calculations, persistence, state transitions, and workflow decisions must remain outside purely visual components.

### 20.38.2 Responsive and viewport behaviour

Work is mobile-first and must adapt to the actual available viewport.

The implementation must support:
- smaller Android phones;
- normal phone widths;
- larger phone displays;
- browser/PWA viewport changes;
- keyboard-open reduced viewport;
- orientation/viewport changes where supported.

Target and Timer remain visually important at every supported size. The dynamic operational area absorbs available space.

No essential content, required field, confirmation action, swipe zone, or bottom navigation may be hidden behind another permanent region or the native keyboard.

Normal driver operations should remain scroll-minimized. Genuine dynamic exception content may use contained/internal scrolling.

### 20.38.3 Header anatomy

The Work header has a stable visual structure:
- Kanishka Enterprises as the primary brand;
- GPS status as an icon-first status indicator;
- Work context;
- stable relationship to the primary navigation.

Header elements must have independent component boundaries so their spacing, sizing, or visual treatment can be adjusted locally.

The header must remain visually quiet compared with the Target, Timer, and current operational action.

The removed legacy labels remain removed:
- Fleet ERP · KFE 2.0
- Local-first

### 20.38.4 Complete control-state system

Every interactive control must have deliberate visual treatment for the states applicable to it:
- default;
- pressed/active;
- focused;
- disabled/unavailable;
- committing/loading;
- success;
- error/attention;
- offline where relevant.

State meaning must not depend on colour alone.

Focused controls must remain clearly visible with the native keyboard open.

A committing control prevents duplicate submission without unnecessarily freezing unrelated parts of the cockpit.

### 20.38.5 Motion principles

Motion is purposeful, brief, and operationally quiet.

Use motion to communicate:
- state transition;
- focus;
- progress;
- commit;
- success;
- safe return/recovery.

Do not use decorative animation that competes with driving attention.

Motion must never be required to understand operational state.

If animation is interrupted, persisted operational state remains authoritative.

The authoritative swipe retains its already-frozen interaction timing and semantics; visual motion may support it but cannot change its commit contract.

### 20.38.6 Iconography

KFE Work uses one coherent icon family and consistent visual weight.

Icons are used primarily for:
- recognisable actions;
- status;
- navigation;
- compact secondary controls.

Icons must not replace necessary text for unfamiliar or safety-relevant actions.

Icon-only controls are permitted where the meaning is established by the KFE visual language, such as the GPS status indicator and fuel secondary action, and must retain an adequate touch target and accessible name.

### 20.38.7 Surface and elevation system

Premium Instrument Work avoids card-heavy presentation.

Use:
- spacing;
- typography;
- restrained borders;
- tonal surface separation;
- limited elevation

to establish hierarchy.

Surfaces are introduced when they improve grouping, focus, touch safety, or state clarity—not merely to place every element inside a card.

Shadows remain subtle and functional. Gradients and decorative depth are not required as default styling.

### 20.38.8 Form visual grammar

All short driver forms use one consistent visual grammar.

Each field clearly separates:
- field label;
- editable value;
- unit;
- calculated/system-derived value where applicable.

Inputs are:
- large and touch-safe;
- native;
- visually simple;
- easy to correct;
- clearly focused;
- compatible with the frozen Next/Done keyboard behaviour.

Required and optional information are visually distinguishable without excessive explanatory text.

Forms show only information necessary for the current event. Automatic values remain subordinate and are not presented as driver-entry tasks.

Confirmation actions are visually distinct from field entry and cannot be confused with keyboard navigation.

### 20.38.9 Loading, empty, error, success, and exception states

Every new Work state that can encounter these conditions must have a deliberate presentation.

**Loading/committing**
- local to the affected operation;
- clear that the action is being processed;
- duplicate-safe;
- does not unnecessarily blank the cockpit.

**Empty**
- concise;
- explains the relevant absence only when needed;
- presents the next useful action when one exists.

**Error**
- identifies the actual problem;
- preserves useful input;
- points to the corrective action;
- does not expose implementation details to the driver.

**Success**
- concise;
- confirms what completed;
- transitions to the next appropriate context without unnecessary acknowledgement.

**Exception/attention**
- visually noticeable;
- explicit about what needs attention;
- provides one obvious next action.

### 20.38.10 Accessibility and touch safety

The Work replacement must support accessible operation across its visual system.

Requirements include:
- sufficient contrast in Light and Dark themes;
- visible focus treatment;
- effective touch targets for operational controls;
- accessible names for icon-only controls;
- state communication through text/structure/iconography in addition to colour;
- readable numerical values;
- no essential action dependent solely on a precise small target;
- accessible equivalent for authoritative swipe actions using the same business command path.

Accessibility improvements must preserve the frozen workflow and business logic.

### 20.38.11 Visual/business boundary and editability contract

The new Work must maintain a strict boundary between:
1. business/state logic;
2. data/calculation logic;
3. operational command handling;
4. visual presentation.

The visual layer may change:
- placement;
- size;
- spacing;
- typography;
- colour tokens;
- radius;
- surface treatment;
- helper-text presentation;
- responsive arrangement;
- motion treatment

without changing business calculations or operational rules.

Examples of valid local future changes:
- increase Timer size;
- move the GPS icon;
- adjust Target spacing;
- change input radius;
- reduce helper text;
- tune swipe-bar geometry.

Such changes must not silently modify:
- state transitions;
- calculations;
- persistence;
- mandatory gates;
- authoritative commands;
- reconciliation rules;
- offline behaviour.

### 20.38.12 New Work replacement boundary

**FROZEN**

Implementation of the new Work must treat this document, KFE_VISUAL_DNA.md, and the already-frozen Work workflow as the governing specification.

The old Work implementation is not a template to incrementally repair. It is reference material only for business understanding where needed.

No old-screen UI defect is a requirement to reproduce or fix in the new replacement unless the underlying business rule is explicitly part of the frozen specification.

No implementation is performed by this freeze.

Any future proposal that conflicts with this section must raise:

**DESIGN DRIFT / CONFLICT WARNING**

before implementation.
