# Android Native Ride GPS Contract

**Status:** Implemented in the Android project; physical-device acceptance remains required before the Android background-GPS audit gate can be marked complete.

## Authority

For Android APK builds, the native location foreground service is the authoritative collector while a passenger ride is running. The browser/PWA geolocation path remains active and unchanged for browser deployments and as a supplementary path on Android.

## Runtime contract

1. `KfeNativeGpsService` starts when a ride enters `RIDE_STARTED`.
2. The service runs as an Android location foreground service and continues while the screen is locked/off.
3. Native points are persisted immediately to an app-private JSONL trace file keyed by trip ID.
4. The service uses Android fused location APIs and rejects unusable fixes with accuracy above 100 m.
5. Duplicate native points are suppressed by timestamp/coordinate identity.
6. When KFE resumes or completes/cancels the ride, `NativeGpsService` imports the durable native trace into the canonical `LocationRepository` as `PASSENGER_RIDE_TRACE`.
7. Import is idempotent against existing browser/native snapshots.
8. After successful import, the native trace file is cleared.
9. Ride line-KM is calculated from the complete persisted trace using the existing Haversine trace-distance implementation.
10. The final ride stores `tripKmAuthority: GPS_LINE_TRACE` and records the trace-point count/source in provenance.
11. The browser/PWA location path remains available and is not replaced by the Android implementation.
12. Network loss does not discard native GPS points because collection and persistence are local; synchronization/reconciliation occurs when KFE is available again.

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
