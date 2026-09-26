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

## 21. Baseline / Further Refinement

This document is the **frozen baseline**, including the authoritative swipe-bar contract.

Further design refinement may add detail and new agreed behaviour.

Existing baseline rules must not be silently removed, weakened, or contradicted. If a future refinement conflicts with this baseline or KFE_VISUAL_DNA.md, explicitly raise:

**DESIGN DRIFT / CONFLICT WARNING**

No implementation is implied by this document. It records the agreed design foundation only.
