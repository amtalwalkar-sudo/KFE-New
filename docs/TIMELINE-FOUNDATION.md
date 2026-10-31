# KFE Timeline Foundation

**Role:** Read-only reporting projection. Timeline must not create, correct, or mutate ride/fuel business records.

## Ride GPS source of truth

Timeline reads persisted event-time GPS snapshots from the four ride events only:

- `PICKUP_START`: driver swipes to go to pickup.
- `TRIP_CANCELLED`: driver cancels the ride.
- `TRIP_START`: driver starts the ride.
- `TRIP_END`: driver ends the ride.

A snapshot preserves the provider fix timestamp (`capturedAt`) separately from the ride-event timestamp (`eventAt`). Neither timestamp may replace or rewrite the other. GPS capture is one-shot and offline-capable; no continuous tracking or route/distance calculation is permitted.

## Locality labels

Locality resolution is owned by the PWA and is separate from native GPS capture.

- Resolve all four GPS event types asynchronously after a snapshot is durably captured, without blocking ride actions.
- New reverse geocoding is permitted only for event timestamps within the most recent seven days.
- Save successful locality names permanently in PWA IndexedDB, keyed by canonical snapshot ID. Never use a coordinate-only cache or an arbitrary entry cap.
- If the PWA is offline, show a saved locality where available; otherwise show the stored coordinates. While online, unresolved names remain unavailable until their asynchronous capture-time request or an explicit manual pull-to-refresh succeeds.
- Manual pull-to-refresh retries only unresolved eligible snapshots; it must not overwrite successful saved names.
- No continuous polling, automatic connectivity monitoring, or background locality retry queue.
- A failed lookup never changes GPS coordinates, ride records, fares, or timestamps and never creates a guessed locality.
- Cancellation snapshots are not passenger drop-off locations.

## GPS history retrieval

The native canonical database is the durable source for GPS snapshots. Native record listing is paginated; Timeline requests snapshots only for rides in its selected reporting period and must not rely on a fixed 1,000-record window.

## Scope guard

Do not add new Timeline features or recalculate unrelated business metrics under this contract. Keep this document subordinate to `KFE_BUSINESS_RULES_REGISTER.md`, `docs/KFE-ARCHITECTURE-CONTRACT.md`, and `docs/ANDROID-NATIVE-GPS-CONTRACT.md`.
