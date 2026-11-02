# KFE Operational Lifecycle Contract

**Status:** AUTHORITATIVE  
**Scope:** The single Shift and Trip state machine shared by the PWA Work cockpit and Android ride overlay.

## 1. Ownership

- The PWA owns Shift start and Shift end.
- The Android overlay exposes ride actions only while a canonical Shift is active.
- The PWA browser runtime persists canonical Work records in IndexedDB.
- On Android, native SQLite is the durable canonical Work store; the PWA IndexedDB copy is the synchronized read model.
- The PWA and native overlay must preserve the same transition invariants and stable record identities, but their command adapters are platform-specific: PWA actions use the Work application service; Android overlay actions use the native command service and commit to canonical SQLite even when the WebView is unavailable. Native action events are durably journaled and replayed to synchronize/acknowledge the PWA projection; they are not a second set of trips or a second record history.
- Business meaning is defined only by `KFE_BUSINESS_RULES_REGISTER.md`; stored fields and relationships are defined by `docs/KFE-CANONICAL-DATA-CONTRACT.md`.

## 2. Canonical lifecycle

```text
OFFLINE
  → START SHIFT (PWA; opening odometer)
  → SHIFT ACTIVE
  → GO TO PICKUP (PWA or Android overlay)
  → PICKUP / READY FOR RIDE
       ├─ CANCEL (PWA or Android overlay) → CANCELLED → SHIFT ACTIVE
       └─ START RIDE (PWA or Android overlay) → RIDE ACTIVE
             → END RIDE (PWA or Android overlay)
             → COMPLETED → optional fare entry or explicit skip
             → SHIFT ACTIVE
  → END SHIFT (PWA; closing odometer; no active trip)
  → OFFLINE
```

A cancelled Trip is not a completed Trip. A completed Trip remains history. A Shift cannot end while a Trip is active.

## 3. Authoritative transition ownership

| Transition | Owner |
|---|---|
| Start Shift / opening odometer | PWA Work application |
| Go to Pickup | PWA Work application or Android overlay command adapter |
| Start Ride | PWA Work application or Android overlay command adapter |
| Cancel Trip / optional cancellation fee | PWA Work application or Android overlay command adapter |
| End Ride / completion timestamp | PWA Work application or Android overlay command adapter |
| Fare entry or explicit skip | PWA Work application, or native SQLite form transaction when submitted in the Android overlay; PWA replay synchronizes the read model |
| End Shift / closing odometer | PWA Work application |
| GPS event snapshot capture | Native Android capability on Android; PWA browser adapter only where supported |
| Locality resolution and Timeline labels | PWA application and IndexedDB |

There is no separate reconciliation, shift-review, personal-kilometre or dead-kilometre workflow.

## 4. Transition invariants

- Only one active Shift is allowed.
- Only one active Trip is allowed within a Shift.
- A Trip can be cancelled only while it is in the pickup stage; cancellation is unavailable after ride start.
- A completed or cancelled Trip remains part of history and cannot be silently converted into the other terminal state.
- Fare entry after completion is recoverable. The driver may save the fare or explicitly skip it; skipping records no fare and contributes zero to revenue.
- A cancellation fee is optional; blank/not-applicable is zero. It remains distinct from completed-trip fare.
- Shift revenue is a canonical projection of eligible completed-trip fares and recorded cancellation fees; no manual shift-revenue reconciliation is performed.
- Repeated taps, swipes, process resumes and retries must not create duplicate Trips or duplicate business outcomes.
- A failed commit must not be presented as committed.
- GPS or network availability must not block a ride action.

## 5. Odometer rules

- Shift start requires a finite positive current odometer.
- The current reading cannot be lower than the previous completed Shift's closing odometer.
- For the first KFE Shift, the current reading cannot be lower than the Business Setup opening odometer when that baseline exists.
- Shift end requires a valid closing odometer not lower than the Shift opening reading. An unusually large difference above the configured 500 km confirmation threshold requires explicit confirmation.
- Odometer readings support shift continuity and fuel records. KFE does not classify odometer gaps into personal/dead kilometres and does not derive ride distance.

## 6. GPS event evidence

Native Android captures one-shot GPS snapshots at exactly four Trip events: `PICKUP_START`, `TRIP_START`, `TRIP_END`, and `TRIP_CANCELLED`.

- Capture is offline-capable and never blocks a ride transition.
- Capture is bounded to 30 seconds with fresh provider requests approximately every three seconds.
- Missing permissions or unavailable fixes leave a durable pending event; no coordinate is fabricated.
- Provider capture time (`capturedAt`) is distinct from the existing Trip event time (`eventAt`).
- No continuous tracking, route matching, GPS-derived distance or idle timed retry service is permitted.
- GPS snapshot capture never initiates locality resolution. PWA locality resolution is invoked only by explicit Timeline pull-to-refresh for eligible unresolved snapshots. Successful locality labels are persisted by snapshot ID; no automatic connectivity polling, capture-triggered lookup, or locality retry loop is permitted.
- A cancellation snapshot is not a passenger drop-off location.

## 7. PWA / Android behavior and recovery

The PWA Work cockpit and Android overlay are two interaction surfaces for the same canonical Shift/Trip history.

- Shift start/end remain available only through the PWA Work application.
- The Android overlay may issue ride actions only while a canonical Shift is active.
- Native ride actions are durably journaled and idempotent. The PWA replays/acknowledges native events and refreshes its IndexedDB projection from SQLite.
- On browser PWA, IndexedDB is the canonical local store. On Android, SQLite is canonical for Work and native GPS snapshots; IndexedDB is a synchronized projection for PWA views and application forms.
- After backgrounding, screen lock, process restart, temporary network loss, GPS loss or overlay dismissal, reconstruct state from canonical persisted records and durable native journals. UI state and form drafts are never business authority.

## 8. Change control

A lifecycle change must update this contract, then the affected domain/application transition, repository/native adapter, PWA and Android surfaces, regression tests, and evidence. Supporting documents and phase history cannot expand the current lifecycle.
