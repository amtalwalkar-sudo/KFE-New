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

Locality lookup is a separate presentation-only operation. It may run only when the user explicitly pulls down Timeline to refresh while online. There are no automatic locality retries, polling, background connectivity checks, or queued locality-resolution jobs.

- Show only a locality label returned by the resolver for the saved coordinates.
- If no reliable label is returned, show `Location unavailable`.
- Never use raw coordinates, legacy trip-level location fields, or guessed/fabricated names as a locality label.
- A failed manual refresh must not leave a stale cached label appearing verified.
- A cancellation snapshot is not a passenger drop-off location.
- Locality lookup must not mutate ride records, GPS snapshots, fares, or timestamps.

## Scope guard

Do not add new Timeline features or recalculate unrelated business metrics under this contract. Keep this document subordinate to `KFE_BUSINESS_RULES_REGISTER.md`, `docs/KFE-ARCHITECTURE-CONTRACT.md`, and `docs/ANDROID-NATIVE-GPS-CONTRACT.md`.
