# Active product boundary — 2026-10-21

**This note supersedes the continuous-trace and route-enrichment requirements below for the active application runtime.**

- The active product records **one-shot GPS snapshots** at trip creation, Start Trip, and End Trip (including cancellation/end states), with latitude, longitude, accuracy when available, and the device GPS fix timestamp.
- Snapshots are saved locally. GPS-provider acquisition does not require internet; a fix may take longer when offline. Foreground precise/coarse location permission and enabled device Location Services are required.
- The PWA lifecycle and native Android overlay each capture boundary snapshots so the overlay can complete a trip while the PWA is closed.
- Continuous GPS watches/foreground trace collection, trace auto-resume, Valhalla map matching, dead/business-kilometre calculations, GPS-gap UI, and the Offline Maps screen are **not active product behaviour**. Their source assets remain dormant for possible future reactivation.
- Acceptance is based on boundary snapshot persistence and timestamps—not background trace continuity, routing, or live kilometre displays.

---

# Android Native Ride GPS Contract

**Status:** SUPPORTING NATIVE IMPLEMENTATION CONTRACT — subordinate to docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md and docs/KFE-CANONICAL-DATA-CONTRACT.md.

Physical-device acceptance remains required before the Android background-GPS audit gate can be marked complete.

## Authority

For Android APK builds, the native location foreground service is the authoritative collector while a passenger ride is running. The browser/PWA geolocation path remains active and unchanged for browser deployments. On Android, native owns collection and durable raw trace persistence; the PWA owns filtering, distance calculation, route enrichment, and authoritative movement reconciliation.

## Runtime contract

1. `KfeNativeGpsService` starts when a ride enters `RIDE_STARTED`.
2. The service runs as an Android location foreground service and continues while the screen is locked/off.
3. Native points are persisted immediately to an app-private JSONL trace file keyed by trip ID.
4. The service uses Android fused location APIs and rejects unusable fixes with accuracy above 100 m.
5. Duplicate native points are suppressed by timestamp/coordinate identity.
6. When KFE resumes or completes/cancels the ride, `NativeGpsService` imports the durable native trace into the canonical `LocationRepository` as `PASSENGER_RIDE_TRACE`.
7. Import is idempotent against existing browser/native snapshots.
8. After successful import, the native trace file is cleared.
9. Native code must not calculate or publish authoritative movement distance. The main PWA domain layer filters the complete persisted trace and calculates provisional line-KM using the shared trace-distance implementation; native overlay displays the value supplied by the PWA and may be stale while the PWA is suspended.
10. The final ride stores `tripKmAuthority: GPS_LINE_TRACE` and records the trace-point count/source in provenance.
11. The browser/PWA location path remains available and is not replaced by the Android implementation.
12. Network loss does not discard native GPS points because collection and persistence are local; synchronization/reconciliation occurs when KFE is available again.
13. The main Work screen's provisional distance must remain available with Wi-Fi and mobile data disabled; routing is optional enrichment and must never gate GPS capture or trip transitions.
14. When Valhalla is unavailable, completed trip distance remains explicitly provisional with GPS-line provenance and a durable local reconciliation queue entry. Connectivity restoration retries matching; only valid matched geometry can promote the distance to `VALHALLA_ROAD_TRACE`.

## Physical acceptance gate

The implementation is not considered device-validated until a real Android phone demonstrates:

- active passenger ride;
- screen locked/off;
- additional native GPS points recorded during the screen-off interval;
- KFE resume imports those points without duplicates;
- line-KM increases using the imported complete trace;
- ride completion persists the final line-KM and trace-point count;
- app background/resume does not lose or duplicate the trace;
- temporary network loss does not erase the locally persisted trace.

Until that physical test is completed, the existing Phase 4/F1 device gate remains open.
