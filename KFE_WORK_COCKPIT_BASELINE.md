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

## 21. Baseline / Further Refinement

This document is the **frozen baseline**, including the authoritative swipe-bar contract.

Further design refinement may add detail and new agreed behaviour.

Existing baseline rules must not be silently removed, weakened, or contradicted. If a future refinement conflicts with this baseline or KFE_VISUAL_DNA.md, explicitly raise:

**DESIGN DRIFT / CONFLICT WARNING**

No implementation is implied by this document. It records the agreed design foundation only.
