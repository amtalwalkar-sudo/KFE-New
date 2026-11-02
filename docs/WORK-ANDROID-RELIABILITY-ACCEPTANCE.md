# Work Android Reliability Acceptance Runbook

**Status:** Current physical-device acceptance evidence for the simplified KFE product.  
**Authorities:** `KFE_ANDROID_RELEASE_GATE.md`, `KFE_BUSINESS_RULES_REGISTER.md`, and `docs/KFE-ARCHITECTURE-CONTRACT.md`.

Automated CI and emulator smoke checks do not substitute for these tests. Record the exact APK SHA-256, Git commit, Android version, device model, permission state, battery-optimisation state and result for every test. Use a dedicated test dataset; never run destructive tests against production records.

## A — Exact APK and startup

1. Install the exact APK produced by the CI run under test; record its SHA-256 and commit.
2. Launch KFE and confirm the PWA shell, Work, Timeline, Performance and Admin routes load.
3. Confirm Capacitor plugin registration succeeds and the native overlay can be prepared.
4. Record startup permission state. Denied permissions must be reported honestly and must not be silently treated as granted.

## B — Four event-time GPS snapshots, offline

Keep device Location enabled. First test with required location permission granted, then repeat with permission denied.

1. Start a shift in the PWA.
2. Turn on Airplane mode; keep Wi-Fi/mobile data disabled.
3. Perform GO TO PICKUP, START TRIP, END TRIP and CANCEL RIDE through the native overlay across separate test rides.
4. Verify exactly one durable GPS snapshot is associated with each applicable event: `PICKUP_START`, `TRIP_START`, `TRIP_END`, and `TRIP_CANCELLED`.
5. Verify coordinates, provider accuracy, provider fix time (`capturedAt`) and business-event time (`eventAt`) are retained distinctly.
6. Verify ride actions and their existing business timestamps never wait for GPS; no fare, cancellation value or canonical Trip identity is changed by GPS capture.
7. Verify capture is event-triggered only, with a bounded fresh-fix window; there is no continuous location tracking, route trace or ride-distance calculation.
8. With permission denied, verify the ride action still succeeds and no unauthorized background coordinate capture is attempted.
9. With poor signal/no acceptable fix, verify active location requests stop at the bounded timeout and the durable event remains eligible for a later explicit trigger. Reopen KFE or use the documented GPS status refresh; verify retry does not duplicate the snapshot.

Expected: offline event-time capture, no continuous tracking, no GPS dependency in ride transitions, and no changes to established business timestamps.

## C — Manual-only locality resolution

1. Keep the device offline and open Timeline. Verify saved labels remain visible and unresolved records show stored coordinates or an honest unavailable state.
2. Verify app startup, ride capture, foreground/resume, and connectivity restoration do not initiate locality lookup.
3. Restore internet while KFE is open. Do not pull Timeline; verify no locality lookup occurs automatically.
4. Explicitly pull down to refresh Timeline. Verify only eligible unresolved snapshots from the latest seven days are considered.
5. Verify labels are saved by canonical snapshot ID, survive app restart, and are not overwritten by a less accurate or unrelated result.
6. Verify pickup uses `PICKUP_START`, completed drop uses `TRIP_END`, and cancellation is never shown as a passenger drop-off.
7. Check a known test coordinate against a trusted map reference; reject a locality label that is not geographically credible.

Expected: user-triggered pull-to-refresh is the only locality-resolution trigger. No automatic polling, queued retry or fabricated area name.

## D — PWA / native overlay workflow and recovery

1. Start a shift in the PWA with a valid opening odometer.
2. Background or close the PWA WebView while keeping the shift active.
3. Use the native overlay to perform multiple rides: pickup, trip start, trip end, fare save or explicit skip, cancellation and cancellation-fee save.
4. Verify every action is durably committed in Android SQLite before the overlay advances and that retry/process interruption does not duplicate the Trip or its fare/cancellation facts.
5. Kill the app process (not Force Stop), reopen KFE and verify the same active Shift/Trip identities and pending form state are reconstructed.
6. Reopen the PWA and verify it synchronizes the native-committed canonical records without creating a second write.
7. Repeat a ride while online and while offline; verify both PWA and overlay use the same lifecycle rules and canonical record model.
8. Return to the PWA to enter the closing odometer and end the shift. Verify the overlay cannot start or end a shift.

Expected: PWA owns Shift start/end; the native overlay owns ride commands while active; both adapters preserve one canonical business model and one record history.

## E — Backup, Dropbox and restore

1. Configure Dropbox with a test credential. Confirm the credential is not exposed in logs/screenshots.
2. While KFE is open and online, verify the configured foreground Dropbox backup runs and reports its result.
3. Force-stop and reopen KFE; verify credential-presence state persists without exposing the secret.
4. Go offline, create a uniquely identifiable Shift, Trip, Fuel and GPS event record, and verify local canonical persistence.
5. Restore connectivity while KFE is open; verify the configured foreground backup path runs without duplicating or mutating source records.
6. Export a Phone Backup JSON file and validate that it contains the expected allowlisted records, including native GPS snapshots and persisted locality labels.
7. Restore into a clean test installation and compare record IDs/counts. Verify drafts are not replayed as canonical business facts.
8. Verify restore failure retains the pre-restore recovery checkpoint and allows recovery.

Expected: local operation is independent of internet; Dropbox remains a foreground/live-app backup integration. No native background upload or service-worker cloud polling is required.

## F — Timeline and basic Performance

1. Verify Timeline period filters default to Today and include This week and This month.
2. Verify completed and cancelled rides appear chronologically; cancelled rides are labelled Cancelled.
3. Verify ride fields are start time, duration, fare, pickup area and drop area. No ride distance, km efficiency or route metrics appear.
4. Verify fuel totals include partial and full refills in the selected period.
5. Verify fuel cost/km is unavailable until valid consecutive full-tank odometer readings exist; partial refills do not create mileage intervals.
6. Verify Performance defaults to Today and shows only recorded fare income, completed ride count, cancellation fees, fuel spending, valid full-tank fuel cost/km and income after fuel.
7. Verify missing cancellation fees count as zero; income after fuel includes cancellation fees and subtracts recorded fuel spending.
8. Verify no forecast, target, break-even, provision, amortization, maintenance projection or other retired financial calculation is present.

## G — Admin, forms and Android navigation

1. Verify Admin has exactly Business Setup, Vehicle Records, Finance and Settings.
2. Verify no Ledger menu entry and no duplicate Settings tiles inside the Settings page.
3. Open each active form, save valid data, reopen it and verify persisted values and relationships.
4. Verify older historical dates can be entered where permitted; business start date must not silently reject legitimate older source records.
5. Verify Loan stores contractual source facts and displays only the derived fixed-rate monthly EMI estimate from principal, tenure and annual interest rate. It must not persist EMI or calculate amortization, payment allocation, repayment schedules or a balance ledger.
6. From an Admin detail/form screen press Android Back. Verify it returns to the main Admin menu, not the app exit route.
7. Verify Save/Cancel actions remain visible and do not overlap on the target phone or with the keyboard open.

## H — Reset and recovery safeguards

1. Export a known-good Phone Backup.
2. Trigger Data Reset in the test dataset and verify the pre-reset recovery checkpoint is created before destructive clearing.
3. Verify reset clears business data and restores default preferences without deleting the recovery safeguard.
4. Restore the known-good backup and compare canonical IDs/counts and key relationships.
5. Interrupt a restore/reset at supported interruption points and verify the recovery protocol does not report false success or leave a partially accepted state.

## Android lifecycle boundary

Ordinary process death, reboot and user Force Stop are different Android lifecycle cases. Test ordinary process death and reboot separately. Android may suppress services/receivers after Force Stop until the user launches the app again; do not promise automatic recovery from Force Stop. On the next manual launch, verify durable canonical state and pending actions recover without duplication.

## Result recording

For every test mark PASS / FAIL / NOT RUN and retain:
- device model, Android version, permission and battery settings;
- APK SHA-256, commit and CI run;
- Shift, Trip and GPS snapshot IDs/event types;
- before/after backup timestamps and record counts;
- relevant logcat excerpts with credentials removed;
- screenshots of Work, Timeline, Performance, Admin and backup status.

Do not declare Android device acceptance complete until the exact release APK passes all applicable scenarios on the target physical phone and evidence is retained.
