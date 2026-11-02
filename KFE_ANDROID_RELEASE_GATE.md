# KFE Android Release and Physical-Device Acceptance Gate

**Status:** CURRENT — supporting release gate under `KFE_LAUNCH_MASTER_PLAN.md`.
**Product scope authority:** `KFE_BUSINESS_RULES_REGISTER.md`.
**Architecture authority:** `docs/KFE-ARCHITECTURE-CONTRACT.md`.

This gate verifies the current KFE product only: PWA-owned shift start/end, native Android ride overlay, four offline-capable GPS event snapshots, read-only Timeline, basic recorded-data Performance, basic Admin forms/data, and essential backup/recovery.

## 1. Evidence levels

A change is not fully accepted merely because source contracts pass, the PWA builds, Android compiles, an emulator smoke test passes, or CI is green.

Report separately:
- **Automated CI:** contracts, production PWA build, Capacitor sync, Android APK build, exact-APK emulator smoke, persistence/recovery, and UI smoke.
- **Physical-device acceptance:** the exact APK installed and exercised on the target Android phone.
- **Not verified:** any scenario for which evidence is absent. Never convert CI/emulator evidence into a physical-device PASS.

## 2. Exact APK identity

Record repository, commit SHA, CI run, APK artifact name, and APK SHA-256. The APK exercised by the gate must be the same artifact identified for delivery. Never use an unverified “latest APK”.

## 3. PWA and native ownership

Verify:
1. Shift start and shift end are performed in the PWA main app.
2. The native overlay exposes ride actions only while a canonical shift is active.
3. The overlay can perform pickup, trip start, trip end, fare entry, and cancellation without creating duplicate trips or duplicate business outcomes.
4. The PWA and overlay show the same canonical ride state after synchronization/reopen.
5. Android Back from an Admin detail/form returns to the Admin menu rather than unexpectedly exiting the app.
6. A denied or unavailable Android capability does not falsely report success or corrupt the workflow.

## 4. Four-event GPS acceptance

Verify one event-time snapshot at each of:
- `PICKUP_START` — going to pickup;
- `TRIP_CANCELLED` — cancellation;
- `TRIP_START` — trip start;
- `TRIP_END` — trip end.

For each event:
- the ride action and its established business timestamp remain unchanged and never wait for GPS;
- capture works without internet and is not continuous tracking;
- native event evidence is durable and tied to the canonical event identity;
- provider fix time (`capturedAt`) remains distinct from business event time (`eventAt`);
- permission denial does not block the ride action and does not trigger unauthorized background capture;
- valid fixes are bounded to the event capture window; poor/unverified fixes never become fabricated locality labels;
- when no acceptable fix is obtained, active requests stop and the event remains pending for a later eligible trigger.

Also verify restart/reopen and retry do not create duplicate snapshots or change ride records, fares, cancellation values, or timestamps.

## 5. Manual-only locality acceptance

- GPS capture, app startup, foreground/resume, and native snapshot discovery must not initiate reverse geocoding.
- No automatic connectivity polling, locality retry timer, or background geocoding queue is permitted.
- Only an explicit Timeline pull-to-refresh may resolve eligible unresolved snapshots while online.
- New locality resolution is limited to eligible events within the latest seven days and requires verified accuracy/proximity.
- Successful locality labels persist in PWA storage by canonical snapshot ID across app restart.
- Offline Timeline shows an already saved locality or valid stored coordinates; it never guesses an area.
- Pickup displays `PICKUP_START`; completed drop displays `TRIP_END`; cancellation is not a passenger drop-off.

## 6. Core product acceptance

- **Work:** shift start/end, pickup, trip start/end, cancellation, fare entry, and fuel recording preserve canonical records and timestamps.
- **Timeline:** read-only rides/fuel, cancelled rides clearly labelled, no ride-distance metrics, and fuel calculations follow the business-rule register.
- **Performance:** only recorded revenue, completed ride count, cancellation fees, recorded fuel spending, valid full-tank fuel cost/km, and income after fuel. No targets, forecasts, break-even, provisions, loan amortization, or profitability models.
- **Admin:** current source forms save through the canonical application/repository path; protected relationships and recovery safeguards remain intact.
- **Backup/recovery:** phone export, Dropbox live-app backup, restore, reset checkpoint and recovery safeguards are tested without losing canonical records.

## 7. Automated CI gate

The current CI must pass on the exact latest PR head:
- canonical contract and architecture tests;
- end-to-end conformance and persistence/recovery tests;
- production PWA build and runtime/UI smoke;
- Capacitor Android sync and APK build;
- exact-APK emulator smoke;
- governance and UI-isolation gates.

A skipped or unavailable gate is not a pass. Any new commit invalidates the previous head's CI result until the new head is verified.

## 8. Failure policy

For any failed scenario, identify the owning layer, fix the root cause, add or update regression coverage, rebuild the exact APK where relevant, and rerun the affected gates. Do not patch only the visible symptom.

## 9. Final acceptance record

Record:
- exact commit and APK identity;
- automated CI run and gate outcomes;
- physical phone model/Android version and test outcomes;
- unresolved limitations, if any.

Do not claim complete device acceptance until all required physical-device scenarios above have evidence.
