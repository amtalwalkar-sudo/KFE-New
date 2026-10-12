# Work Android Reliability Acceptance Runbook

This runbook is the required physical-device acceptance test for the KFE Work workflow. Automated CI and emulator smoke checks do not substitute for these tests. Record the exact APK SHA, Android version, device model, battery-optimisation state, permission state and results for every run.

## Build and evidence

1. Install the exact APK from the CI run under test; record its SHA-256 and Git commit.
2. Use a dedicated test vehicle/driver dataset. Do not run destructive restore/reboot tests against production business records.
3. Grant location permission required by the app and enable device location. Record whether Android grants background location; do not assume it.
4. Enable Dropbox backup with a test token and verify the UI reports a successful backup timestamp.
5. Keep the screen recording and exported canonical backup before/after each destructive test.

## Test A — Dropbox credential persistence and upload

- Configure Dropbox token and enable automatic backup while online.
- Force-stop and reopen the app; verify the token-presence status remains true without re-entering the token. Do not expose the token in screenshots/logs.
- Record a uniquely identifiable test fuel entry; wait for the automatic foreground backup status to update.
- Verify the Dropbox file's modified time and download/validate the JSON backup.
- Disable Internet, create another test record, and verify the local record persists. Restore Internet while the app is open; verify the foreground retry uploads the newer record.
- Expected: credentials survive restart in Android Keystore-backed storage; cloud backup succeeds only when the app is foregrounded/active and network is available. A background upload while the app is closed is not promised by the current architecture.

## Test B — screen-off GPS, dead movement

- Start a shift and allow the opening odometer gate to complete.
- Drive a safe, repeatable 1–2 km dead-movement segment between trips.
- Turn the screen off for at least 10 minutes; do not force-stop the app.
- Turn the screen on, return to Work and end the shift after entering the correct closing odometer.
- Verify shift-owned DEAD_MOVEMENT_TRACE points exist in canonical gps_snapshots under entityType=SHIFT, have timestamps spanning the screen-off interval, and are included in movement reconciliation. Compare point counts and trace distance before/after.
- Expected: native trace is flushed to canonical storage before end-shift reconciliation; no duplicate points on a second open/sync.

## Test C — process death during an active trip

- Start a shift, go to pickup and start a passenger trip.
- Confirm the foreground GPS notification is visible and at least two native trace points have been recorded.
- Kill only the app process (do not use Android Force Stop): adb shell am kill <applicationId>.
- Reopen the app; verify the active trip and native GPS owner resume without creating a duplicate shift or trip.
- End the trip; verify the trip reaches its completed/pending-fare state and its native trace is imported under entityType=TRIP.
- Enter and save the fare once. Confirm exactly one canonical trip and one fare record exist.

## Test D — reboot during an active trip

- Start a test trip and confirm native trace points are being written.
- Reboot the device normally.
- Unlock the device, allow boot recovery and reopen KFE. Record whether Android permits the service to resume under the current permission/battery settings.
- Verify the active trip remains the same, new GPS points resume only when the OS allows them, and the pre-reboot trace remains importable.
- End the trip and verify trace import, odometer/reconciliation and fare capture.
- Expected: canonical records survive reboot. GPS resumption is a conditional Android OS behaviour and must be marked FAIL if the service does not restart under the documented permission/settings profile.

## Test E — pending-fare recovery

- End a passenger trip, then terminate the WebView/app process before entering the fare.
- Reopen Work. Verify the same completed trip is presented for fare entry and its draft values are restored only for that trip.
- Save the fare. Reopen Work and verify the fare form does not reappear for the saved trip and no duplicate fare is created.
- Repeat with the fare intentionally skipped. Verify an explicitly skipped trip is terminal and is not reopened.

## Test F — restore on a clean installation

- Upload a fresh Dropbox backup containing identifiable shift, trip, fuel and GPS records.
- Install the same app version in a clean Android profile/device and configure Dropbox credentials.
- Restore the backup and compare store counts and record IDs with the downloaded source backup.
- Verify the active/pending trip state is restored safely, form drafts are not accidentally replayed, and subsequent writes succeed.
- Expected: all canonical allowlisted records match; excluded native trace files and form drafts are not assumed to be present in Dropbox. If a required movement trace has not been imported into canonical gps_snapshots, the restore test fails.

## Result recording

For each test mark PASS/FAIL/NOT RUN and attach:
- device model, Android version and permission/battery settings;
- APK SHA-256 and Git commit;
- before/after backup timestamps and store counts;
- canonical shift/trip/GPS record IDs and event types;
- native service logcat excerpt with credentials removed;
- screenshots of the Work state and backup status.

Do not declare the Work section loss-proof until all tests pass on the actual target Android device and the evidence is retained with the release.
