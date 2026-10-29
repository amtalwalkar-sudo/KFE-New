# KFE 2.0 Timeline Foundation

Timeline is a read-only projection over authoritative Work and ERP records. It does not create or correct business data. Reporting periods use the correct event boundary, and ordering is deterministic by authoritative occurrence time and stable event identity.

## Ride GPS

The only ride GPS events are `PICKUP_START`, `TRIP_CANCELLED`, `TRIP_START`, and `TRIP_END`. Timeline reads their persisted snapshots and never captures GPS, geocodes, or mutates a snapshot. Timeline shows validated GPS coordinates only; it does not display area names. Legacy trip-level location fields are not a display fallback because they may be stale or inaccurate.

GPS snapshots preserve provider `capturedAt` independently from business `eventAt`. Capture is offline-first and one-shot; continuous tracking, internet-based locality resolution, and automatic retries for area names are out of scope.
