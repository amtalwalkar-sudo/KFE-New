# KFE Operational Lifecycle Contract

**Status:** AUTHORITATIVE  
**Scope:** Cross-surface operational state and transition semantics for Shift, Pickup, Trip, Cancellation, Reconciliation, and operational recovery.

## 1. Purpose

This is the sole human-readable authority for the KFE operational lifecycle.

It defines the canonical operational state machine and transition ownership used by the PWA Work cockpit, Android operational overlay, ride/system notifications, and background/native operational capture.

Those surfaces are representations/controllers of the same canonical operational state. None is a second workflow or business system.

Business meaning remains governed by KFE_BUSINESS_RULES_REGISTER.md. Canonical persisted entities and source-of-truth fields remain governed by docs/KFE-CANONICAL-DATA-CONTRACT.md. Arithmetic remains governed by docs/KFE-CALCULATION-SPECIFICATION.md.

## 2. Canonical lifecycle

OFFLINE → START SHIFT → ODOMETER / GAP GATE → ONLINE / READY → GO TO PICKUP → READY FOR TRIP → TRIP ACTIVE → TRIP COMPLETION → FARE / COMPLETION CONFIRMATION → NEXT PICKUP → END SHIFT → RECONCILIATION → SHIFT REVIEW → SHIFT ENDED → OFFLINE

From READY FOR TRIP, CANCEL TRIP is available while the canonical trip remains in pickup and returns to the applicable ready state.

The precise persisted state names may differ from presentation labels, but every implementation state must map to exactly one position in this lifecycle.

## 3. Authoritative transition ownership

| Transition | Authority |
|---|---|
| Start Shift | canonical Work/application command path |
| Odometer gap acknowledgement/allocation | canonical Work/application command path |
| Go to Pickup | canonical operational command path |
| Start Trip | canonical operational command path |
| Cancel Trip while in pickup | canonical Trip lifecycle path |
| End Trip | canonical operational command path |
| Fare/completion confirmation | canonical Trip/Shift application path |
| End Shift | canonical Work/application command path |
| Reconciliation | canonical reconciliation/application path |
| Shift Review / closure | canonical Work/application path |

PWA, Android overlay, and notification actions must invoke the same authoritative command/mutation path for a transition. A surface must never implement a private second mutation path.

## 4. Transition invariants

- A trip cannot be cancelled after it has started.
- A completed trip remains history; completion is not deletion.
- Fare entry after trip completion remains available until the authoritative completion/fare workflow is resolved.
- Only a valid active operational state can expose the corresponding primary action.
- Repeated taps, swipes, notifications, process resumes, and retries must not create duplicate authoritative mutations.
- A failed commit must not be presented as committed.
- Network availability must not be required for an action that the canonical local-first business path permits offline.
- GPS availability must not block an operational command unless the governing business rule explicitly requires GPS evidence for that command.
- Temporary UI state, animation, notification text, overlay visibility, or draft data is never proof that a transition committed.

## 5. Odometer / shift-start gate

At shift start, the current odometer is reconciled against the previous authoritative odometer boundary.

Where a gap exists, the complete gap must be classified through the governed allocation flow. The driver must not bypass the gate by inventing a different authoritative odometer history.

The current frozen operational rule permits the gap to be allocated to the governed Personal KM or Dead KM categories. Exact business treatment remains governed by the business-rule register and canonical data/calculation contracts.

## 6. Pickup and cancellation

While a canonical trip is in PICKUP / READY FOR TRIP:
- Go to Pickup and cancellation are available according to the current Work command contract.
- Cancellation records the existing canonical Trip as cancelled; it does not create a second trip.
- A blank/not-applicable cancellation fee remains absent (`null`); an explicitly entered zero remains numeric `0`.
- Blank cancellation-fee detail must not create an independent revenue record. Cancelled-trip amounts remain supporting-only and never replace authoritative shift revenue.

Once the trip enters TRIP ACTIVE, cancellation is no longer an available operational command.

## 7. Trip completion and fare

End Trip commits the canonical trip-completion transition.

The completion/fare workflow must appear as the immediate next operational context and remain recoverable until its authoritative outcome is resolved.

Trip-level fare detail remains optional supporting detail where the canonical data contract defines shift-level revenue as the ERP revenue authority. The driver may save or explicitly skip the fare detail. Skipping preserves the completed Trip and does not create fare/revenue detail; missing optional fare detail must not block the next pickup or shift closure. The fare form must not create a competing revenue authority.

## 8. End shift / reconciliation

End Shift is available only when the current lifecycle permits closure.

Closure proceeds through END SHIFT → RECONCILIATION → SHIFT REVIEW → SHIFT ENDED.

Reconciliation is derived from canonical persisted records. A reconstructed total is a read representation, not a replacement persisted authority. It must distinguish missing optional trip-level fare detail from missing authoritative shift-level revenue; missing fare detail alone is not a closure gate.

## 9. PWA / Android / notification parity

The three operational surfaces may differ in presentation, touch mechanics, and available controls, but they must represent the same canonical state.

canonical operational state → PWA / Android / Notification

The Android overlay is not an alternate Work screen with alternate business logic. The notification is not an alternate state machine. The PWA Work cockpit is not permitted to bypass the canonical application/repository transition path.

## 10. Background, interruption and restart

Operational truth is the persisted canonical state, not the last rendered screen.

After app backgrounding, screen lock, browser refresh, process restart, temporary network loss, GPS loss, or overlay dismissal/restoration, KFE must reconstruct the current operational state from canonical persisted state and applicable durable native evidence.

Transient UI state may be restored for convenience but cannot override canonical state.

## 11. GPS boundary

GPS/location evidence is supporting operational evidence unless a specific canonical business rule explicitly makes it authoritative for a calculation or event.

The native Android GPS collector may continue during the screen-off/background lifecycle where the Android capability contract permits it. Native trace collection/import is governed by docs/ANDROID-NATIVE-GPS-CONTRACT.md; the lifecycle meaning of starting/stopping operational capture is governed here.

GPS collection must never become a second operational lifecycle.

## 12. Recovery / duplicate protection

Every authoritative operational command must be safe under replay:

intent → validate current canonical state → commit one canonical mutation → publish resulting state → surface result

If a pending recovery record exists, it is a recovery mechanism for the same command, not a second business operation.

## 13. Work cockpit relationship

KFE_WORK_COCKPIT_BASELINE.md is the Work presentation/interaction baseline. It may define what the driver sees, action-surface presentation, shell placement, keyboard/viewport behavior, swipe presentation, and attention hierarchy.

It must not redefine the lifecycle above.

## 14. Android relationship

docs/ANDROID-NATIVE-GPS-CONTRACT.md defines native GPS collection/import implementation and its physical-device acceptance boundary. It must not redefine operational state semantics.

KFE_ANDROID_RELEASE_GATE.md defines release acceptance and does not redefine the lifecycle.

## 15. Change control

Any lifecycle change must update this document first, then affected tests, application transitions, PWA/Android surfaces, and evidence.

A phase freeze, audit, overlay implementation, notification implementation, or UI document cannot silently change the operational state machine.