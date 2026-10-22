# GPS tracking and Valhalla removal

**Status:** GPS/Valhalla removal merged in PR #330 (`0d5ba16865482fd5be4280c46f0102380119a534`); optional-GPS startup behavior merged in PR #336 (`ad55bacf4f620d790ed9ca67533ca45a328daf7e`); actual provider fix-timestamp validation merged in PR #338 (`6086c28d167efa3c715585f1c489e1cedde6f6b2`); and repository persistence now rejects missing/invalid fix timestamps in PR #340 (`513ff2cb1d8235c7c57ff05509d625cd06880462`). PR #336, #338, and #340 passed their branch CI and Android release gates. The post-merge `KFE 2.0 single CI` for #340 completed successfully on merge commit `513ff2cb1d8235c7c57ff05509d625cd06880462` (run `39742759376`).

## Active runtime behavior

- Continuous GPS watches, movement trace collection, background GPS services, GPS trace reconciliation, and GPS-driven kilometre estimates are removed.
- KFE retains **one-shot GPS snapshots at trip start and trip end**. Each snapshot stores latitude, longitude, accuracy when available, and the actual GPS fix timestamp in the canonical trip record.
- The one-shot path uses the local GPS provider / browser geolocation and makes no network, reverse-geocoding, or routing request. It can capture a fix without internet when phone Location is enabled and a GPS fix is available.
- The native overlay captures its own trip-boundary snapshots while the PWA is closed. The PWA uses the same canonical trip record and mirrors completed snapshot writes across surfaces.
- Snapshot capture is best-effort and does not block or roll back durable trip-stage, fare, or cancellation commits. If a fix cannot be obtained, the trip remains usable and the snapshot stays marked missing.
- GPS status UI, continuous GPS collector/recovery service, trace reconciliation queue, Offline Maps screen, offline tile-management plugin, online/offline Valhalla adapter, and map-publishing workflow are removed.
- Android keeps foreground fine/coarse location permissions and the location foreground-service permission needed to request a single GPS fix while the native overlay is operating with the PWA closed. The existing overlay foreground service activates the location type only during a one-shot request and returns to its normal type afterward; it does not start a watch or trace collector. Background location permission, continuous GPS services, Play Services location, Valhalla libraries, and their dependencies are removed.
- Startup does **not** require location permission or enabled phone Location Services. Snapshot capture is optional/best-effort: when permission, provider, fix, or a valid provider fix timestamp is unavailable, the snapshot remains missing and trip/fare/cancellation workflows must continue. No current wall-clock timestamp may be substituted for the GPS provider's actual fix timestamp.

## Data and business-rule safety

- Existing canonical shift/trip records and historical GPS snapshot backup stores are retained for backward compatibility; this removal does not purge previously saved user data.
- Existing manually entered or imported trip-kilometre values are not deleted or replaced by GPS snapshots.
- Shift start/end, trip lifecycle, native event replay/idempotency, fare entry, cancellation entry, and canonical SQLite/IndexedDB persistence must remain functional while the PWA is closed.
- KFE's revenue authority remains eligible completed-trip fares plus cancellation fees; blank/not-applicable cancellation fees remain ₹0. GPS removal must not alter this rule.
- Shift odometer readings and manual gap allocation remain independent of GPS. No GPS or Valhalla result becomes kilometre or revenue authority.

## Verification completed for the merged change

1. The contract suite and production PWA build passed on the merged commit.
2. Android build and exact-APK emulator acceptance passed, including the native overlay acceptance suite.
3. Offline one-shot trip-boundary snapshot persistence/restore integration passed; the Android release gate passed.
4. UI isolation, governance, and deployed runtime verification passed.
5. The post-merge `KFE 2.0 single CI` run completed successfully on removal commit `0d5ba16865482fd5be4280c46f0102380119a534`. The actual-fix-timestamp changes in PR #338 and repository-boundary validation in PR #340 passed their branch CI and Android release gates; the post-merge CI for #340 also passed on merge commit `513ff2cb1d8235c7c57ff05509d625cd06880462`.

The older GPS/Valhalla design documents are marked superseded and retained only as historical audit context.
