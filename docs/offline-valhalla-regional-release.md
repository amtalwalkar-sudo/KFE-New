# Offline Valhalla regional map release contract

## Fixed region

The Android app uses one standard offline region: Mumbai, Pune, Nashik and Alibag, including connecting roads and a practical margin. The region identifier is `mumbai-pune-nashik-alibag-v1`. The app does not ask the driver to choose map areas.

## Native storage and engine

- Native Valhalla engine: `io.github.rallista:valhalla-mobile:0.6.3`, with `trace_route` map matching.
- Regional tile archive and small install metadata live under the app-private `files/offline-maps/` directory.
- Downloads are staged separately, checked against the manifest byte count and SHA-256, and only then activated. The previous tile archive and metadata are retained for rollback until the new pair is committed.
- Matching runs on a dedicated worker. The JavaScript router gives it a 1.2-second foreground wait budget; a slow/failed match falls back to the online adapter. Raw GPS points remain the evidence source and are not deleted by map operations.
- The canonical backup allowlist remains explicit. GPS evidence and trips stay backed up; map files, tile indexes and map metadata are not business backup stores.

## Required release asset

The Android downloader reads this release asset:

`https://github.com/amtalwalkar-sudo/KFE-New/releases/latest/download/offline-maps-manifest.json`

The manifest must be JSON with these fields:

- `regionId`: exactly `mumbai-pune-nashik-alibag-v1`.
- `region`: display label, e.g. `Mumbai · Pune · Nashik · Alibag`.
- `version`: immutable regional data version.
- `engineVersion`: Valhalla mobile engine compatibility version.
- `packageUrl`: HTTPS URL to a prebuilt Valhalla tile-extract TAR archive.
- `sizeBytes`: exact archive byte count.
- `sha256`: lowercase SHA-256 digest of the archive.

The archive must be built from OSM road data using a compatible Valhalla tile builder, cover the fixed region plus margin, and be validated with representative traces across all four named areas and their connecting roads.

## Release readiness limitation

The native engine bridge, app-private downloader, checksum/size validation, staged update/rollback, bounded matching path and Admin controls are implemented in the feature branch. **The actual regional tile archive and its release manifest are not yet published.** Until that release asset exists, the Admin download action will report that the map manifest is unavailable; this branch must not be represented as having a downloadable map package or as ready for real offline-routing field tests. Publish and verify the tile archive/manifest before shipping an APK for map testing.

## Acceptance checks before merge/release

1. CI compiles the Android dependency and plugin and runs the offline map + backup boundary contracts.
2. Publish a region package and manifest; verify size and SHA-256 from a clean device.
3. Download, interrupt, retry, and update while confirming the old map remains usable until the replacement validates.
4. Run native `trace_route` traces in Mumbai, Pune, Nashik, Alibag and between them with network disabled.
5. Test outside coverage with network enabled (online fallback) and disabled (raw GPS retained for later matching).
6. Verify backup/restore carries trips and `gps_snapshots`, never tile archives; map update failure/deletion must not mutate canonical records.
7. Confirm a slow map match cannot delay a swipe, trip transition or fare save.
