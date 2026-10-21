# GPS tracking and Valhalla removal

**Status:** focused removal is implemented on branch `remove/gps-valhalla-runtime`; automated CI and release-gate verification are pending.

## Active runtime behavior

- Continuous GPS watches, movement trace collection, background GPS services, GPS trace reconciliation, and GPS-driven kilometre estimates are removed.
- KFE retains **one-shot GPS snapshots at trip start and trip end**. Each snapshot stores latitude, longitude, accuracy when available, and the actual GPS fix timestamp in the canonical trip record.
- The one-shot path uses the local GPS provider / browser geolocation and makes no network, reverse-geocoding, or routing request. It can capture a fix without internet when phone Location is enabled and a GPS fix is available.
- The native overlay captures its own trip-boundary snapshots while the PWA is closed. The PWA uses the same canonical trip record and mirrors completed snapshot writes across surfaces.
- Snapshot capture is best-effort and does not block or roll back durable trip-stage, fare, or cancellation commits. If a fix cannot be obtained, the trip remains usable and the snapshot stays marked missing.
- GPS status UI, continuous GPS collector/recovery service, trace reconciliation queue, Offline Maps screen, offline tile-management plugin, online/offline Valhalla adapter, and map-publishing workflow are removed.
- Android keeps foreground fine/coarse location permissions and the location foreground-service permission needed to request a single GPS fix while the native overlay is operating with the PWA closed. The existing overlay foreground service activates the location type only during a one-shot request and returns to its normal type afterward; it does not start a watch or trace collector. Background location permission, continuous GPS services, Play Services location, Valhalla libraries, and their dependencies are removed.
- Startup checks ensure location permission and phone Location are available; they do not start tracking or a background location service.

## Data and business-rule safety

- Existing canonical shift/trip records and historical GPS snapshot backup stores are retained for backward compatibility; this removal does not purge previously saved user data.
- Existing manually entered or imported trip-kilometre values are not deleted or replaced by GPS snapshots.
- Shift start/end, trip lifecycle, native event replay/idempotency, fare entry, cancellation entry, and canonical SQLite/IndexedDB persistence must remain functional while the PWA is closed.
- KFE's revenue authority remains eligible completed-trip fares plus cancellation fees; blank/not-applicable cancellation fees remain ₹0. GPS removal must not alter this rule.
- Shift odometer readings and manual gap allocation remain independent of GPS. No GPS or Valhalla result becomes kilometre or revenue authority.

## Verification required before merge

1. Run the complete contract suite and production PWA build.
2. Run Android debug/release compilation and native overlay acceptance, including fare/cancellation durability with WebView disabled.
3. Verify start/end coordinates and fix timestamps persist and survive reload/backup with networking disabled.
4. Run UI isolation and governance gates.
5. Inspect all CI failures and confirm all checks on the exact PR head before merge.

The older GPS/Valhalla design documents are marked superseded and retained only as historical audit context.
