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
