# Android Ride GPS Contract

KFE captures one GPS snapshot at exactly four ride workflow events:

- `PICKUP_START`: driver swipes to go to pickup.
- `TRIP_CANCELLED`: driver cancels the ride.
- `TRIP_START`: driver swipes to start the ride.
- `TRIP_END`: driver swipes to end the ride.

Each snapshot records latitude, longitude, accuracy when supplied, the provider's actual fix timestamp (`capturedAt`), and the separate business-event timestamp (`eventAt`). Never substitute one timestamp for the other.

GPS capture is local and does not require internet. Android stores event requests durably and attempts a one-shot provider fix only when required location permissions are granted. No continuous tracking, route matching, distance calculation, reverse geocoding, connectivity polling, locality queues, or automatic area-name lookup is part of this contract. A missing fix must not block the ride transition or alter business data.

The browser PWA uses one-shot browser geolocation and local snapshot persistence. Android uses the native durable event queue. These are platform adapters for the same four-event snapshot contract, not competing writers during normal Android operation.

Display a saved locality only if it is already trustworthy and attached to that snapshot; otherwise show coordinates when valid, or “Location unavailable”. Never reuse legacy trip fields or infer an area name. Physical-device verification must test all four events offline, permission denial, app/service reopening, stable event identity, and that ride timestamps/fares remain unchanged.
