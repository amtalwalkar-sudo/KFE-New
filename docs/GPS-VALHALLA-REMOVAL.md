# GPS tracking and Valhalla removal

**Status:** removal implementation on branch `remove/gps-valhalla-runtime`; pending automated CI and release-gate verification.

## Active runtime behavior

- KFE no longer requests location permission or reads browser/Android location APIs.
- The PWA no longer captures trip-boundary location snapshots or starts GPS movement traces.
- The native overlay continues to own its existing durable trip-stage, fare, and cancellation interactions, but no longer captures coordinates at trip boundaries.
- GPS status UI, GPS collector/recovery service, trace reconciliation queue, Offline Maps screen, offline tile-management plugin, online/offline Valhalla adapter, and map-publishing workflow are removed.
- Android location permissions, Play Services location, Valhalla libraries, and the foreground-location service plugin are removed from the app configuration.
- Startup checks still cover the settings required by the overlay and notifications, plus Xiaomi background autostart/battery confirmation. Location services are not a startup prerequisite.

## Data and business-rule safety

- Existing canonical shift/trip records and historical GPS snapshot backup stores are retained for backward compatibility; this removal does not purge previously saved user data.
- Existing manually entered or imported trip-kilometre values are not deleted by this change.
- Shift start/end, trip lifecycle, native event replay/idempotency, fare entry, cancellation entry, and canonical SQLite/IndexedDB persistence must remain functional while the PWA is closed.
- KFE's revenue authority remains eligible completed-trip fares plus cancellation fees; blank/not-applicable cancellation fees remain ₹0. GPS removal must not alter this rule.
- Shift odometer readings and existing manual gap allocation remain independent of GPS.

## Verification required before merge

1. Run the complete contract suite and production PWA build.
2. Run Android debug/release compilation and the native overlay acceptance tests, including fare/cancellation durability with WebView disabled.
3. Run UI isolation and governance gates.
4. Inspect all CI failures, fix regressions, and confirm all checks on the exact PR head before merge.

The older GPS/Valhalla design documents are marked superseded and retained only as historical audit context.
