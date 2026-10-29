> **Superseded 2026-10-22:** GPS capture/tracking and Valhalla routing have been removed from the active KFE runtime. This document is retained as historical audit context only; do not use it as an implementation or release contract.

# Android Trip-Boundary GPS Contract

**Active scope (2026-10-21): one-shot GPS snapshots only.** This contract supersedes older continuous-trace requirements.

## Capture and persistence

- Capture a one-shot GPS fix and its device fix timestamp at passenger-trip start and trip end; retain a separate pickup-start snapshot where that workflow boundary is recorded.
- Persist latitude, longitude, accuracy when available, and the GPS provider's actual fix timestamp as `capturedAt` locally. Never substitute the current wall-clock time when a fix timestamp is absent or invalid; treat that snapshot as unavailable. GPS-provider capture does not require internet. A fix may take longer offline and requires Android Location Services plus foreground precise/coarse location permission.
- Cancellation is a terminal trip boundary and receives the same one-shot endpoint snapshot.
- Never start a continuous watch, background GPS trace collector, trace auto-resume, route matching, Valhalla routing, or kilometre calculation for this feature.
- The PWA and Android overlay capture snapshots without blocking trip transitions or fare/cancellation forms. A missing fix must not prevent a trip from completing; saved lifecycle timestamps remain authoritative.
- Snapshot capture/persistence must not require the PWA to remain open when the native overlay is completing an otherwise-supported trip workflow.
- Physical-device acceptance verifies start/end snapshots and timestamps with networking disabled, durable persistence after app/service reopening, and overlay operation with the PWA closed. It should also verify that missing/unavailable GPS does not block trip completion.

## Explicit non-goals

This feature does not collect continuous location traces, calculate distance, categorize kilometres, match routes, call Valhalla, or automatically resume GPS recording after reboot. Continuous trace, screen-off trace collection, routing and distance-reconciliation acceptance requirements are out of scope and must not be used as release criteria for this snapshot contract.



## Persisted snapshot validation and locality enrichment (2026-10-29)

- A pending one-shot event is complete only when its canonical `GPS_SNAPSHOT` contains valid latitude/longitude bounds and a non-empty provider `capturedAt`. An incomplete matching row must not clear the durable pending request; a later permission-gated one-shot attempt may repair that same event identity.
- Reverse geocoding is manual-only and is triggered from the Timeline pull-down refresh (or its accessible refresh control). Native GPS capture and app startup/lifecycle events must never enqueue locality lookup work.
- No Android worker, periodic job, retry timer, connectivity listener, or background service may request area names. If a manual request cannot resolve a name, retain the original coordinates and leave the record eligible for the user's next explicit refresh.
- Display only locality/city/state values actually returned by the geocoder. If no usable name exists, retain the coordinates for offline display; never infer or fabricate an area name.
- Device audit must compare each ride ID and event type against the native `GPS_SNAPSHOT` rows. Distinguish (1) no snapshot, (2) snapshot with invalid/missing coordinates or provider timestamp, (3) valid coordinates with no locality label, and (4) valid coordinates and locality label. Do not repair business rows or rewrite event timestamps as part of the audit.
