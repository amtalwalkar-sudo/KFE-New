# Android Trip-Boundary GPS Contract

**Active scope (2026-10-21): one-shot GPS snapshots only.** This contract supersedes older continuous-trace requirements.

## Capture and persistence

- Capture a one-shot GPS fix and its device fix timestamp at passenger-trip start and trip end; retain a separate pickup-start snapshot where that workflow boundary is recorded.
- Persist latitude, longitude, accuracy when available, and `capturedAt` locally. GPS-provider capture does not require internet. A fix may take longer offline and requires Android Location Services plus foreground precise/coarse location permission.
- Cancellation is a terminal trip boundary and receives the same one-shot endpoint snapshot.
- Never start a continuous watch, background GPS trace collector, trace auto-resume, route matching, Valhalla routing, or kilometre calculation for this feature.
- The PWA and Android overlay capture snapshots without blocking trip transitions or fare/cancellation forms. A missing fix must not prevent a trip from completing; saved lifecycle timestamps remain authoritative.
- Snapshot capture/persistence must not require the PWA to remain open when the native overlay is completing an otherwise-supported trip workflow.
- Physical-device acceptance verifies start/end snapshots and timestamps with networking disabled, durable persistence after app/service reopening, and overlay operation with the PWA closed. It should also verify that missing/unavailable GPS does not block trip completion.

## Explicit non-goals

This feature does not collect continuous location traces, calculate distance, categorize kilometres, match routes, call Valhalla, or automatically resume GPS recording after reboot. Continuous trace, screen-off trace collection, routing and distance-reconciliation acceptance requirements are out of scope and must not be used as release criteria for this snapshot contract.

