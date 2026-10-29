# Android Ride GPS Contract

**Scope:** Native/PWA event-time GPS capture. Timeline locality display is a separate, explicitly user-triggered presentation enrichment.

KFE captures one GPS snapshot at exactly four ride workflow events:

- `PICKUP_START`: driver swipes to go to pickup.
- `TRIP_CANCELLED`: driver cancels the ride.
- `TRIP_START`: driver swipes to start the ride.
- `TRIP_END`: driver swipes to end the ride.

Each snapshot records latitude, longitude, accuracy when supplied, the provider's actual fix timestamp (`capturedAt`), and the separate business-event timestamp (`eventAt`). Never substitute one timestamp for the other.

GPS capture is local and does not require internet. Android stores event requests durably and attempts a one-shot provider fix only when required location permissions are already granted. A missing fix must not block the ride transition or alter business data. There is no continuous tracking, route matching, or GPS-based distance calculation.

## Locality display boundary

The native GPS collector never reverse-geocodes and never performs network requests. Timeline may resolve a saved coordinate to an area/locality name only when the user explicitly pulls the Timeline page down while online.

- No automatic locality retries, polling, background connectivity checks, or queued locality-resolution jobs.
- Offline refresh leaves saved GPS snapshots intact and reports that locality lookup needs an online manual refresh.
- A resolved locality is display-only cached enrichment; it must never modify ride business records, event timestamps, or GPS snapshots.
- Timeline shows a locality only when the resolver returns a valid area/locality label. Otherwise it shows “Location unavailable”.
- Never present raw coordinates as an area name, reuse legacy trip-location fields, or infer/fabricate a locality.
- Pickup is sourced only from `PICKUP_START`; a completed trip's drop area is sourced only from `TRIP_END`. A cancellation snapshot must never be presented as a passenger drop-off.

## Platform adapters and verification

The browser PWA uses one-shot browser geolocation and local snapshot persistence. Android uses the native durable event queue. These are platform adapters for the same four-event snapshot contract, not competing business writers. Android event capture must not require internet.

Physical-device verification must test all four events offline, permission denial, app/service reopening, stable event identity, manual locality refresh online/offline, and that ride timestamps/fares remain unchanged.
