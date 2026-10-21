> **Superseded 2026-10-22:** GPS capture/tracking and Valhalla routing have been removed from the active KFE runtime. This document is retained as historical audit context only; do not use it as an implementation or release contract.

# Offline Valhalla map storage boundary

## Required storage separation

KFE's native Android Admin Settings offers selectable offline road-routing packages for the full Mumbai–Pune–Nashik–Alibag corridor or individual Mumbai metro, Pune, Nashik, and Alibag areas. Routing must use the currently installed package only inside its published coverage bounds and use online matching outside coverage when internet is available.

The following boundary is mandatory:

- **Canonical business/evidence storage:** shifts, trips, fares, fuel, and canonical GPS points remain in the canonical database and are included in data backups.
- **Device-only map storage:** Valhalla tiles, tile indexes, routing graph files, downloaded map archives, and temporary download files live under Android's app-specific files directory in a dedicated `offline-maps/` subtree. They are never written to the canonical IndexedDB stores or local/cloud backup snapshots.
- **Small metadata only:** map version, download status, coverage identifier and timestamps may be stored as small settings/metadata. Metadata must not contain tile bytes or a base64/serialized copy of the map.
- **Restore/migration:** restoring a business backup restores GPS evidence and business records, not map files. A replacement phone downloads the standard map package again.
- **Reset/update:** resetting business data or restoring a backup must not erase or overwrite downloaded maps. Map update/delete operations must not alter business records or GPS evidence.
- **Failure handling:** if offline coverage is absent, incomplete or being updated, preserve raw GPS evidence locally and use online matching when possible. Routing must never block swipes, trip transitions, or fare saves.

## Current implementation status

The canonical backup service currently uses an explicit allowlist of canonical database stores, including `gps_snapshots`. This document and its contract guard that boundary; they do **not** claim the native Valhalla engine, packaged road tiles, downloader, online/offline router selection, or Admin download UI are already implemented.

Do not release the full offline-routing feature until native map storage and download management are implemented and tests prove:
1. map files reside only in app-specific native storage;
2. exported/local/Dropbox backups contain GPS evidence but no map bytes or paths to map files;
3. restore on a clean installation restores GPS evidence without restoring map files;
4. download/update/delete failures leave canonical data untouched;
5. routing selection and trace matching work offline inside coverage and fall back online outside coverage without blocking Work actions.
