> **Superseded 2026-10-22:** GPS capture/tracking and Valhalla routing have been removed from the active KFE runtime. This document is retained as historical audit context only; do not use it as an implementation or release contract.

# Offline Valhalla regional map release contract

## Selectable regions

The Android app offers selectable offline coverage packages: the full Mumbai–Pune–Nashik–Alibag corridor, Mumbai metro, Pune, Nashik, or Alibag. The stable `offline-maps-manifest.json` is a catalog containing each package's region ID, version, URL, byte count, SHA-256, and coverage bounds. Only one package is active on a device at a time; choosing another downloads and validates it before replacing the previous package.

## Native storage and engine

- Native Valhalla engine: `io.github.rallista:valhalla-mobile:0.6.4`, with `trace_route` map matching.
- Regional tile archive and small install metadata live under the app-private `files/offline-maps/` directory.
- Downloads are staged separately, checked against the manifest byte count and SHA-256, and only then activated. The previous tile archive and metadata are retained for rollback until the new pair is committed; startup recovery restores the previous pair if a process dies mid-update. Status exposes latest version, download size, safe-update free-space requirement, and available storage.
- Matching runs on a dedicated worker. The JavaScript router gives it a 1.2-second foreground wait budget; a slow/failed match falls back to the online adapter. Raw GPS points remain the evidence source and are not deleted by map operations.
- The canonical backup allowlist remains explicit. GPS evidence and trips stay backed up; map files, tile indexes and map metadata are not business backup stores.

## Required release asset

The Android downloader reads this stable release asset (not GitHub's moving `latest` alias):

`https://github.com/amtalwalkar-sudo/KFE-New/releases/download/offline-maps/offline-maps-manifest.json`

`.github/workflows/publish-offline-valhalla-maps.yml` builds a full corridor package plus separate Mumbai metro, Pune, Nashik and Alibag extracts from Geofabrik's Western Zone OSM data using Valhalla 3.9.1 (matching `valhalla-mobile` 0.6.4). It smoke-tests `trace_route` against the full corridor and each area package, then publishes the versioned TARs, SHA-256 catalog and OSM attribution to the fixed `offline-maps` release.

The stable manifest is a catalog with `schemaVersion`, `attribution`, and a `regions` array. Each region entry declares `regionId`, `region`, `version`, `engineVersion`, HTTPS `packageUrl`, exact `sizeBytes`, lowercase `sha256`, source URL, and `coverageBounds` (`south`, `north`, `west`, `east`). Each archive must be built from OSM road data using a compatible Valhalla tile builder and smoke-tested against representative traces within that package's coverage.

## Release readiness limitation

The native engine bridge, app-private downloader, checksum/size validation, staged update/rollback, region selector, per-region matching guard, and map-publishing workflow are implemented in the feature branch. The release catalog and packages are published only by the main-branch release workflow. Until that workflow completes and publishes the catalog and all five packages, Admin Settings must report that map packages are unavailable. This must not be represented as working offline routing yet.

## Acceptance checks before field use/release

1. CI compiles the Android dependency and plugin and runs the offline map + backup boundary contracts.
2. Publish a region package and manifest; verify size and SHA-256 from a clean device.
3. Download each selectable area, interrupt/retry/update while confirming the previous active map remains usable until the replacement validates.
4. Run native `trace_route` traces in Mumbai, Pune, Nashik, Alibag and between them with network disabled.
5. Test outside coverage with network enabled (online fallback) and disabled (raw GPS retained for later matching).
6. Verify backup/restore carries trips and `gps_snapshots`, never tile archives; map update failure/deletion must not mutate canonical records.
7. Confirm a slow map match cannot delay a swipe, trip transition or fare save.
