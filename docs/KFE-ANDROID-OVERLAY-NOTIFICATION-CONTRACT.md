# KFE Android Overlay + Notification Contract

**Status:** SUPPORTING CONTRACT  
**Scope:** Android Overlay + Notifications only  
**Authority relationship:** Subordinate to the canonical KFE business, data, lifecycle, calculation, and PWA UI/UX authorities.

> This document is the single governing document for Android Overlay + Notification behavior. New rules for these surfaces must be added to this same document rather than creating parallel overlay/notification rule documents.

## 1. Purpose

The Android overlay is a **driver cockpit surface for the current KFE Work state when the driver is outside the PWA**.

The overlay is not a separate KFE workflow, business-logic authority, calculation authority, or state authority.

## 2. Overlay Visibility

The overlay is visible **only while the driver is Online**.

The overlay applies to these Online Work states:

1. Online / Ready
2. Go to Pickup
3. Ready for Trip
4. Trip Active
5. Trip Complete / Fare Entry
6. Next Pickup

The following stages remain **main-PWA-only** and are not performed through the Android overlay:

- Shift Start
- Shift End
- Reconciliation
- Shift Review

## 3. Overlay Driver Cockpit Information

The overlay must provide the following current-work information as applicable to the current state:

- Driver target / progress
- Timer
- Trip KM

During Trip Complete / Fare Entry, the overlay must provide a fare-entry prompt.

### 3.1 Frozen State 1 — ONLINE / READY

When the current Work state is **ONLINE / READY**:

- The overlay displays **only the current Target progress**.
- No additional information is displayed.
- The primary overlay action is **GO TO PICKUP**.
- **GO TO PICKUP** uses the frozen **Blue semantic** action colour.
- No previous-trip or next-trip information is displayed.
- **GO TO PICKUP** is available directly from both the Android overlay and the PWA.
- Both surfaces must remain synchronized representations of the same canonical state and command.
- GPS is **background context only** in this state. GPS availability must not block the overlay action.
- The overlay can be minimized by holding it and dragging it upward beyond the phone's upper edge.
- When minimized, it becomes a **bubble** fixed to either the left or right edge of the screen.
- The minimized bubble remains movable by holding and dragging it.
- No other information or control is introduced into ONLINE / READY beyond these frozen rules.

### 3.2 Frozen State 2 — GO TO PICKUP

When the current Work state is **GO TO PICKUP**:

- The overlay displays:
  - Current Target progress
  - Timer
  - Dead KM
- The primary action is **START TRIP**.
- **START TRIP** uses the frozen **Green semantic** action colour.
- Trip cancellation is available from this state.
- Cancellation presents exactly two predefined selectable reasons:
  - **Passenger cancelled**
  - **Driver cancelled**
- After a cancellation reason is selected, a **Trip Cancellation Fee** form is displayed.
- The driver enters the cancellation amount and presses **OKAY**.
- After the cancellation fee is confirmed, the overlay returns to the **pickup screen with the Blue GO TO PICKUP swipe bar**, ready for the pickup workflow again.
- GPS remains **background context only**. GPS availability must not block START TRIP or cancellation actions.
- The overlay uses the same minimize interaction frozen for State 1:
  - hold and drag upward beyond the phone's upper edge;
  - overlay becomes a bubble;
  - bubble fixes to either the left or right screen edge;
  - bubble remains movable by holding and dragging.
- PWA and Android overlay remain synchronized representations of the same canonical workflow.
- **START TRIP** can be initiated directly from either the PWA or Android overlay.
- If the action is performed on either surface, the other surface must reflect the same canonical resulting state.
- Cancellation performed from either surface must use the same canonical cancellation workflow and return both surfaces to the same resulting pickup state.


### 3.3 Frozen State 3 — READY FOR TRIP

When the current Work state is **READY FOR TRIP**:

- The overlay displays:
  - Current Target progress
  - Timer
  - Trip KM
- The primary action is **START TRIP**.
- **START TRIP** uses the frozen **Green semantic** action colour.
- Cancellation is no longer presented after START TRIP has been committed; cancellation belongs to the pickup/cancellation stage before the trip becomes active.
- GPS remains **background context only** and must not block the operational action.
- The overlay uses the same minimize interaction frozen for the earlier states:
  - hold and drag upward beyond the phone's upper edge;
  - overlay becomes a bubble;
  - bubble fixes to either the left or right screen edge;
  - bubble remains movable by holding and dragging.
- START TRIP can be initiated directly from either the PWA or Android overlay.
- Starting the trip from either surface must commit the same canonical trip transition and cause both surfaces to reflect the same resulting **TRIP ACTIVE** state.
- The swipe bar remains a touch surface only; it triggers the canonical START TRIP command and contains no independent business logic.

## 4. Fare Entry

After a ride ends, fare entry must be available through the overlay.

Fare completion must support entry of:

- Fare
- Toll
- Parking

These entries remain subject to the canonical KFE business rules, data rules, calculations, and persistence path.

## 5. Cancellation

The overlay must support cancellation using the existing KFE cancellation workflow.

It must provide:

- The existing **two predefined cancellation reasons**
- Cancellation fee entry

The overlay must not introduce alternative cancellation reasons or independent cancellation business rules.

For the frozen GO TO PICKUP state, the two predefined reasons are:

- **Passenger cancelled**
- **Driver cancelled**

After the reason is selected, the driver enters the cancellation amount and presses **OKAY**. The canonical cancellation commit must complete before the workflow returns to the pickup state.

## 6. PWA and Android Overlay Synchronization

The main PWA and Android overlay must remain synchronized representations of the same KFE Work state.

An action performed in either surface must transition the same canonical workflow.

Example:

1. Starting the ride in the PWA starts the ride and the overlay reflects **Trip Active**.
2. Starting the ride in the overlay starts the same ride and the PWA reflects **Trip Active**.
3. The active-trip phase then exposes **End Trip**.
4. Ending the trip from either surface transitions the same trip to **Trip Complete / Fare Entry**.
5. Fare entry is then performed against that same trip.

There must not be a PWA-only ride state and a separate Android-only ride state.

## 7. UI/UX and Business-Rule Parity

The Android overlay must follow the main PWA UI/UX Shell rules as applicable to the Android overlay surface.

The overlay must also follow the canonical KFE:

- business logic
- calculations
- state/lifecycle rules
- data rules
- interaction rules
- semantic colour coding

Android must not create a second interpretation of an existing KFE rule.

The frozen semantic swipe colours remain:

- **Blue — Go to Pickup**
- **Green — Start Trip**
- **Red — End Trip**

Any Android-specific presentation adaptation must preserve the meaning and behavior defined by the canonical PWA/UI and business authorities.

## 8. Single-Source Workflow Principle

The intended architecture is:

**PWA Work / Android Overlay → same canonical KFE state, commands, data, and calculations**

The Android overlay is a presentation/action surface for the canonical workflow, not a parallel workflow.

## 9. Rule Evolution and Contradiction Warning

This document will be expanded as the Android Overlay + Notification rules are defined.

When a proposed future rule contradicts an already frozen rule in this document, the contradiction must be explicitly identified **before implementation**.

The warning must state:

1. **Contradicting rule** — which frozen rule is affected.
2. **Proposed change** — what the new rule would change.
3. **Implication** — what behavior, architecture, UI/UX, business logic, synchronization, data, testing, or release consequences may result.
4. **Decision required** — whether the existing rule remains frozen or is intentionally changed.

A contradictory proposal must not silently replace a frozen rule.

If a rule is intentionally changed, this document must be updated so the new rule becomes the explicit current rule and the change is traceable.

## 10. Implementation Boundary

Implementation must follow the rules in this document only after the relevant behavior has been discussed and frozen.

No legacy Android overlay/notification behavior is automatically carried forward merely because it existed previously.

New behavior must use the canonical KFE state/command/data path and remain synchronized with the PWA.

---

## Change Log

### Initial Freeze — 2026-10-03

Frozen from the agreed Overlay rules:

- Overlay is a driver cockpit surface for the current KFE Work state when the driver is outside the PWA.
- Overlay is visible only while Online.
- Online overlay states: Online / Ready, Go to Pickup, Ready for Trip, Trip Active, Trip Complete / Fare Entry, Next Pickup.
- Shift Start, Shift End, Reconciliation, and Shift Review remain main-PWA-only.
- Overlay provides driver target/progress, timer, and Trip KM.
- Fare entry after ride completion includes Fare, Toll, and Parking.
- Cancellation uses the existing two predefined reasons and supports cancellation fee entry.
- Android overlay follows the main PWA UI/UX Shell rules, business logic, calculations, and semantic colour coding.
- PWA and overlay remain synchronized representations of the same canonical workflow.
- Starting/ending a ride from either surface transitions the same canonical trip and exposes the same next phase.
- Future additions are made to this same document.
- Contradictions must produce a caution warning with implications before implementation.

### State 1 Freeze — ONLINE / READY — 2026-10-03

Frozen from the agreed state-by-state definition:

- Only current Target progress is displayed.
- Primary action is GO TO PICKUP.
- GO TO PICKUP uses the Blue semantic action colour.
- No previous-trip or next-trip information is displayed.
- GO TO PICKUP is available directly from both the overlay and PWA.
- Overlay and PWA remain synchronized on the same canonical state and command.
- GPS remains background context only and does not block the action.
- Overlay can be minimized by holding and dragging it beyond the phone's upper edge.
- Minimized overlay becomes a bubble fixed to either the left or right screen edge.
- The bubble can be moved by holding and dragging it.
- No additional information or controls are added to ONLINE / READY.

### State 2 Freeze — GO TO PICKUP — 2026-10-03

Frozen from the agreed state-by-state definition:

- Display only current Target progress, Timer, and Dead KM.
- Primary action is START TRIP.
- START TRIP uses the Green semantic action colour.
- Trip cancellation is available in this state.
- Cancellation has exactly two selectable reasons: Passenger cancelled and Driver cancelled.
- After selecting a cancellation reason, the driver enters the cancellation amount in the Trip Cancellation Fee form and presses OKAY.
- After successful cancellation confirmation, the workflow returns to the pickup screen with the Blue GO TO PICKUP swipe bar.
- GPS remains background context only and never blocks START TRIP or cancellation.
- Minimize behavior is identical to State 1: hold and drag beyond the upper edge, then use the movable edge-docked bubble.
- START TRIP and cancellation can be initiated from either PWA or overlay and both surfaces must reflect the same canonical resulting state.


### State 3 Freeze — READY FOR TRIP — 2026-10-03

Frozen from the agreed state-by-state definition:

- Display current Target progress, Timer, and Trip KM.
- Primary action is START TRIP.
- START TRIP uses the Green semantic action colour.
- Cancellation is not presented after START TRIP has been committed.
- GPS remains background context only and does not block the operational action.
- Minimize behavior is identical to the earlier states: hold and drag beyond the upper edge, then use the movable edge-docked bubble.
- START TRIP is available from both PWA and Android overlay.
- Both surfaces must reflect the same canonical TRIP ACTIVE transition.
- The swipe bar is only a touch surface for triggering the canonical START TRIP command; it has no independent business logic.
