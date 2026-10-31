# Android Ride GPS Contract

**Scope:** Native/PWA event-time GPS capture. Timeline locality display is a separate, explicitly user-triggered presentation enrichment.

KFE captures one GPS snapshot at exactly four ride workflow events:

- `PICKUP_START`: driver swipes to go to pickup.
- `TRIP_CANCELLED`: driver cancels the ride.
- `TRIP_START`: driver swipes to start the ride.
- `TRIP_END`: driver swipes to end the ride.

Each snapshot records latitude, longitude, provider accuracy, the provider's actual fix timestamp (`capturedAt`), and the separate business-event timestamp (`eventAt`). Never substitute one timestamp for the other.

GPS capture is local and does not require internet. Android durably queues each event and makes repeated fresh location requests for up to 30 seconds, using enabled GPS and network location providers. Requests are spaced at approximately three-second intervals. A fix with supplied accuracy at 75 metres or better is accepted; less accurate fixes are ignored while the bounded window remains. If the provider omits accuracy metadata, preserve the valid coordinate as unverified but do not reverse geocode it. If no acceptable fix is obtained, active requests stop and the durable event remains pending for a later eligible retry. The ride transition never waits for GPS and no business timestamp changes. There is no continuous tracking, route matching, or GPS-based distance calculation.

## Locality display boundary

The PWA owns reverse geocoding and permanent locality persistence. Native Android stores coordinates only and never performs geocoding.

- After each of the four event snapshots is durably saved, the PWA starts reverse geocoding asynchronously when available; ride actions never wait for it.
- All four event types are eligible for locality resolution.
- New geocoding is limited to events whose `eventAt` is within the most recent seven days.
- If the PWA is offline, show the saved locality if one exists; otherwise show the saved coordinates. A manual Timeline pull-to-refresh retries unresolved eligible events when online.
- Successful locality names are saved permanently in PWA IndexedDB, keyed by canonical GPS snapshot ID. They are not keyed only by coordinates and are not subject to a 500-entry cache cap.
- Existing successful locality names are not silently overwritten by ordinary retries.
- No continuous network polling, automatic connectivity monitoring, or unbounded retry loop is permitted.
- A provider result is accepted only when it includes coordinates within the saved GPS fix's accuracy-aware proximity bound (100–150 metres). A locality name without verifiable nearby result coordinates is rejected.
- Never present guessed/fabricated localities or reuse legacy trip-location fields. Pickup and drop presentation rules remain separate: pickup uses `PICKUP_START`; only a completed ride's drop uses `TRIP_END`. Cancellation location is not a passenger drop-off.

## Platform adapters and verification

The browser PWA uses one-shot browser geolocation and local snapshot persistence. Android uses the native durable event queue. These are platform adapters for the same four-event snapshot contract, not competing business writers. Android event capture must not require internet.

Physical-device verification must test all four events offline, permission denial, app/service reopening, stable event identity, manual locality refresh online/offline, and that ride timestamps/fares remain unchanged.
