#!/usr/bin/env bash
set -euo pipefail

cd "$GITHUB_WORKSPACE"
mkdir -p artifacts/android-golden
ADB_BIN="$(type -P adb)"
test -n "$ADB_BIN" || { echo "ADB executable was not found on PATH." >&2; exit 1; }

# Bound every ordinary ADB call. Instrumentation invocations below have their own
# longer explicit timeout; unbounded transport/device commands must never hang CI.
adb() {
  local limit="${KFE_ADB_COMMAND_TIMEOUT_SECONDS:-30}"
  if [[ "${1:-}" == "wait-for-device" ]]; then
    limit="${KFE_ADB_WAIT_TIMEOUT_SECONDS:-15}"
  fi
  timeout --foreground "${limit}s" "$ADB_BIN" "$@"
}

adb_ready() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if adb wait-for-device && [ "$(adb get-state 2>/dev/null || true)" = "device" ]; then return 0; fi
    adb reconnect offline >/dev/null 2>&1 || true
    sleep 2
  done
  return 1
}

adb_ready
adb shell settings put global package_verifier_enable 0 || true
adb shell settings put global verifier_verify_adb_installs 0 || true

"$GITHUB_WORKSPACE/android/gradlew" -p "$GITHUB_WORKSPACE/android" :app:assembleDebugAndroidTest

# Android requires the instrumentation APK to share the target app signer.
# Re-sign the test APK with the persistent release key; never modify the tested app APK.
: "${KFE_ANDROID_KEYSTORE_PATH:?Missing persistent Android keystore path}"
: "${KFE_ANDROID_KEYSTORE_PASSWORD:?Missing persistent Android keystore password}"
: "${KFE_ANDROID_KEY_ALIAS:?Missing persistent Android key alias}"
: "${KFE_ANDROID_KEY_PASSWORD:?Missing persistent Android key password}"
BUILD_TOOLS="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
TEST_APK="$GITHUB_WORKSPACE/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
SIGNED_TEST_APK="${TEST_APK%.apk}-release-signed.apk"
"$BUILD_TOOLS/apksigner" sign --ks "$KFE_ANDROID_KEYSTORE_PATH" --ks-key-alias "$KFE_ANDROID_KEY_ALIAS" --ks-pass "pass:$KFE_ANDROID_KEYSTORE_PASSWORD" --key-pass "pass:$KFE_ANDROID_KEY_PASSWORD" --out "$SIGNED_TEST_APK" "$TEST_APK"
"$BUILD_TOOLS/apksigner" verify --verbose "$SIGNED_TEST_APK"
mv "$SIGNED_TEST_APK" "$TEST_APK"

capture_failure() {
  local label="$1"
  timeout 8s adb logcat -d -t 5000 > "artifacts/android-golden/${label}-logcat.log" || true
}

emu_geo_fix() {
  local longitude="$1"
  local latitude="$2"
  # The emulator console can briefly disconnect across reboot. Bound the call
  # and retry once after reconnecting rather than hanging the entire CI step.
  if ! timeout 10s adb emu geo fix "$longitude" "$latitude"; then
    adb reconnect device >/dev/null 2>&1 || true
    sleep 2
    timeout 10s adb emu geo fix "$longitude" "$latitude" || {
      echo "Unable to inject emulator GPS fix ($longitude,$latitude) after reconnect." >&2
      return 1
    }
  fi
}

inject_gps_fixes() {
  # The Android emulator accepts longitude before latitude.
  emu_geo_fix 72.8777 19.0760
  sleep 3
  emu_geo_fix 72.8697 19.0850
  sleep 3
  emu_geo_fix 72.8610 19.0930
  sleep 4
}


start_instrumentation_until_ready() {
  local test_class="$1"
  local marker="$2"
  local label="$3"
  mkdir -p artifacts/android-golden
  RECOVERY_INSTRUMENTATION_LOG="artifacts/android-golden/${label}-instrumentation.log"
  RECOVERY_INSTRUMENTATION_LABEL="$label"
  adb shell run-as com.kanishka.pwa rm -f "files/$marker" >/dev/null 2>&1 || true
  timeout 180s adb shell am instrument -w -r -e class "com.kanishka.pwa.KfeRecoveryHardeningTest#$test_class" com.kanishka.pwa.test/androidx.test.runner.AndroidJUnitRunner > "$RECOVERY_INSTRUMENTATION_LOG" 2>&1 &
  RECOVERY_INSTRUMENTATION_PID=$!
  local ready=false
  for attempt in $(seq 1 35); do
    if adb shell run-as com.kanishka.pwa test -f "files/$marker" >/dev/null 2>&1; then
      ready=true
      break
    fi
    if ! kill -0 "$RECOVERY_INSTRUMENTATION_PID" 2>/dev/null; then break; fi
    sleep 1
  done
  if [ "$ready" != true ]; then
    capture_failure "${label}-not-ready"
    cat "$RECOVERY_INSTRUMENTATION_LOG" >&2 || true
    kill "$RECOVERY_INSTRUMENTATION_PID" >/dev/null 2>&1 || true
    echo "Recovery instrumentation did not signal readiness: $label" >&2
    exit 1
  fi
}

finish_instrumentation_until_ready() {
  local instrumentation_status=0
  wait "$RECOVERY_INSTRUMENTATION_PID" || instrumentation_status=$?
  cat "$RECOVERY_INSTRUMENTATION_LOG"
  if [ "$instrumentation_status" -ne 0 ] \
    || ! grep -Eq "^INSTRUMENTATION_CODE: -1$" "$RECOVERY_INSTRUMENTATION_LOG" \
    || ! grep -Eq "^OK \(1 test\)$" "$RECOVERY_INSTRUMENTATION_LOG"; then
    capture_failure "$RECOVERY_INSTRUMENTATION_LABEL"
    echo "Recovery instrumentation failed or did not report one passing test: $RECOVERY_INSTRUMENTATION_LABEL" >&2
    exit 1
  fi
}

install_apk() {
  local apk="$1"
  local label="$2"
  if ! adb_ready || ! adb install -r "$apk"; then
    sleep 3
    adb_ready || true
    if ! adb install -r "$apk"; then
      capture_failure "${label}-install-failure"
      echo "APK install failed: ${label}" >&2
      return 1
    fi
  fi
}

run_instrumentation() {
  local test_class="$1"
  local label="$2"
  local expected_count="$3"
  local log_file="artifacts/android-golden/${label}-instrumentation.log"
  if ! timeout 180s adb shell am instrument -w -r -e class "$test_class" com.kanishka.pwa.test/androidx.test.runner.AndroidJUnitRunner > "$log_file" 2>&1; then
    cat "$log_file"
    capture_failure "$label"
    echo "ANDROID INSTRUMENTATION FAILED OR TIMED OUT (180s): $label" >&2
    return 1
  fi
  cat "$log_file"
  if ! grep -Eq "^INSTRUMENTATION_CODE: -1$" "$log_file"; then
    capture_failure "$label"
    echo "ANDROID INSTRUMENTATION TERMINAL RESULT CODE WAS NOT SUCCESS (-1): $label" >&2
    return 1
  fi
  if ! grep -Eq "^OK \(${expected_count} tests?\)$" "$log_file"; then
    capture_failure "$label"
    echo "ANDROID INSTRUMENTATION DID NOT REPORT THE EXPECTED TEST COUNT (${expected_count}): $label" >&2
    return 1
  fi
  if grep -Eq "FAILURES!!!|Tests run: [0-9]+, Failures: [1-9]|shortMsg=Process crashed|INSTRUMENTATION_RESULT: shortMsg=" "$log_file"; then
    capture_failure "$label"
    echo "ANDROID INSTRUMENTATION REPORTED A FAILURE: $label" >&2
    return 1
  fi
}

run_lifecycle_process_death_case() {
  local stage="$1"
  local boundary="$2"
  local label="lifecycle-process-death-${stage,,}-${boundary,,}"
  local prepare_log="artifacts/android-golden/${label}-prepare.log"
  local ready=false
  local pid_before=""
  local pid_to_kill=""
  local process_death_observed=false
  # Instrumentation can briefly reset the emulator's adb transport. Re-establish
  # the device before clearing logcat; a transient logcat-clear failure must not
  # abort the entire gate before the actual process-death case even starts.
  if ! adb_ready; then
    capture_failure "${label}-adb-not-ready"
    echo "ADB device was not ready before lifecycle process-death case ${stage}/${boundary}." >&2
    return 1
  fi
  adb logcat -c >/dev/null 2>&1 || true
  # This test parks inside the production persistence sequence at the requested
  # boundary. The only way forward is for this harness to kill the target process.
  timeout 100s adb shell am instrument -w -r \
    -e class com.kanishka.pwa.KfeNativeFullShiftAcceptanceTest#prepareLifecycleProcessDeathAtBoundary \
    -e lifecycleStage "$stage" -e lifecycleBoundary "$boundary" \
    com.kanishka.pwa.test/androidx.test.runner.AndroidJUnitRunner > "$prepare_log" 2>&1 &
  local prepare_pid=$!
  for attempt in $(seq 1 35); do
    # ADB may return a transient nonzero status while its transport reconnects.
    # Treat a failed PID probe as "not ready yet" and retry, not as a shell-fatal error.
    pid_before="$(adb shell pidof com.kanishka.pwa 2>/dev/null | tr -d '\r' | awk '{print $1}' || true)"
    if [ -n "$pid_before" ] && adb shell run-as com.kanishka.pwa grep -Fq "${stage}_${boundary}" shared_prefs/kfe_overlay.xml 2>/dev/null; then
      ready=true
      break
    fi
    if ! kill -0 "$prepare_pid" 2>/dev/null; then break; fi
    adb_ready || true
    sleep 1
  done
  if [ "$ready" != true ]; then
    cat "$prepare_log" >&2 || true
    capture_failure "${label}-not-ready"
    kill "$prepare_pid" >/dev/null 2>&1 || true
    echo "Lifecycle process-death preparation never reached ${stage}/${boundary}." >&2
    return 1
  fi
  adb root >/dev/null 2>&1 || true
  adb wait-for-device || true
  if ! adb shell id 2>/dev/null | grep -q 'uid=0'; then
    capture_failure "${label}-root-unavailable"
    kill "$prepare_pid" >/dev/null 2>&1 || true
    echo "Cannot inject an actual process kill for ${stage}/${boundary}: adb root unavailable." >&2
    return 1
  fi
  pid_to_kill="$(adb shell pidof com.kanishka.pwa 2>/dev/null | tr -d '\r' | awk '{print $1}' || true)"
  if [ -z "$pid_to_kill" ]; then
    capture_failure "${label}-pid-missing"
    kill "$prepare_pid" >/dev/null 2>&1 || true
    echo "Target process disappeared before kill at ${stage}/${boundary}." >&2
    return 1
  fi
  adb shell kill -9 "$pid_to_kill" || {
    capture_failure "${label}-kill-failed"
    kill "$prepare_pid" >/dev/null 2>&1 || true
    echo "SIGKILL failed at ${stage}/${boundary}." >&2
    return 1
  }
  adb unroot >/dev/null 2>&1 || true
  adb wait-for-device || true
  wait "$prepare_pid" >/dev/null 2>&1 || true
  for attempt in $(seq 1 25); do
    local pid_after
    pid_after="$(adb shell pidof com.kanishka.pwa 2>/dev/null | tr -d '\r' | awk '{print $1}' || true)"
    if [ -z "$pid_after" ] || [ "$pid_after" != "$pid_to_kill" ]; then
      process_death_observed=true
      break
    fi
    sleep 1
  done
  if [ "$process_death_observed" != true ]; then
    capture_failure "${label}-kill-not-observed"
    echo "Target PID did not change after SIGKILL at ${stage}/${boundary} (PID $pid_to_kill)." >&2
    return 1
  fi
  # A fresh instrumentation invocation starts a new app process and checks the
  # checkpoint, outbox event identity, canonical write, and exact retry outcome.
  run_instrumentation \
    com.kanishka.pwa.KfeNativeFullShiftAcceptanceTest#verifyLifecycleProcessDeathRecovery \
    "${label}-verify" 1
  local case_log="artifacts/android-golden/${label}-case.log"
  adb logcat -d -s KFE_LIFECYCLE_DEATH:I '*:S' > "$case_log"
  cat "$case_log"
  if ! grep -Fq "LIFECYCLE_PROCESS_DEATH_CASE_PASS stage=$stage boundary=$boundary" "$case_log"; then
    capture_failure "${label}-missing-pass-marker"
    echo "Missing real process-death recovery marker at ${stage}/${boundary}." >&2
    return 1
  fi
  echo "VERIFIED_LIFECYCLE_PROCESS_DEATH_CASE stage=$stage boundary=$boundary"
}

install_apk "$GITHUB_WORKSPACE/artifacts/android-golden/app-debug.apk" "production-apk"
# Prove Android permits an in-place package replacement and preserves app-private data.
adb_ready
adb shell 'run-as com.kanishka.pwa sh -c "mkdir -p files; printf upgrade-proof > files/kfe-upgrade-proof.txt"'
install_apk "$GITHUB_WORKSPACE/artifacts/android-golden/app-debug.apk" "production-apk-in-place-upgrade"
if ! adb shell 'run-as com.kanishka.pwa cat files/kfe-upgrade-proof.txt' | grep -qx 'upgrade-proof'; then
  capture_failure "in-place-upgrade-data-loss"
  echo "IN-PLACE UPGRADE DATA PRESERVATION FAILED" >&2
  exit 1
fi
install_apk "$GITHUB_WORKSPACE/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk" "instrumentation-apk"
# The startup gate now intentionally blocks until the required native permissions
# are granted. Pre-grant them on this disposable emulator so instrumentation tests
# verify the post-setup app state rather than getting stuck on permission UI.
adb shell pm grant com.kanishka.pwa android.permission.ACCESS_FINE_LOCATION
adb shell pm grant com.kanishka.pwa android.permission.ACCESS_COARSE_LOCATION
adb shell pm grant com.kanishka.pwa android.permission.POST_NOTIFICATIONS
adb shell cmd location set-location-enabled true || adb shell settings put secure location_mode 3
adb shell appops set com.kanishka.pwa android:system_alert_window allow
adb shell appops set com.kanishka.pwa android:camera allow || true
adb shell am force-stop com.kanishka.pwa
run_instrumentation com.kanishka.pwa.KfeWebViewStartupTest webview-startup 1

# Failure-oriented native persistence checks: a lost bridge acknowledgement must
# not double-count fares, and stale/equal-version snapshots must not overwrite
# the canonical shift/trip projection.
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#canonicalWritesRemainIdempotentAfterLostAcknowledgementAndRejectStaleSnapshots canonical-persistence 1

# A failed SQLite pending-queue read must reject recovery rather than resolve as an empty queue.
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#nativeEventQueueReadFailureMustNotMasqueradeAsSuccessfulEmptyRecovery native-queue-read-failure 1

# Run the nine lifecycle interruption/retry combinations in the real Android gate.
# Clear prior markers first, then require one explicit logcat result for every case.
adb logcat -c
run_instrumentation com.kanishka.pwa.KfeNativeFullShiftAcceptanceTest#lifecyclePersistenceRecoversAfterEveryCheckpointOutboxAndCanonicalBoundary lifecycle-fault-recovery 1
lifecycle_case_log="artifacts/android-golden/lifecycle-fault-cases.log"
adb logcat -d -s KFE_LIFECYCLE_FAULT:I '*:S' > "$lifecycle_case_log"
cat "$lifecycle_case_log"
for lifecycle_stage in GO_TO_PICKUP START_RIDE END_RIDE; do
  for lifecycle_boundary in AFTER_CHECKPOINT AFTER_OUTBOX AFTER_CANONICAL; do
    if ! grep -Fq "LIFECYCLE_FAULT_CASE_PASS stage=$lifecycle_stage boundary=$lifecycle_boundary" "$lifecycle_case_log"; then
      echo "Missing explicit lifecycle fault recovery result: stage=$lifecycle_stage boundary=$lifecycle_boundary" >&2
      exit 1
    fi
    echo "VERIFIED_LIFECYCLE_FAULT_CASE stage=$lifecycle_stage boundary=$lifecycle_boundary"
  done
done
# Actual SIGKILL/restart at every production lifecycle boundary. Each case must
# reach its boundary marker, lose the original app PID, restart in a new process,
# retry the same logical action, and pass durable outbox/canonical assertions.
for lifecycle_stage in GO_TO_PICKUP START_RIDE END_RIDE; do
  for lifecycle_boundary in AFTER_CHECKPOINT AFTER_OUTBOX AFTER_CANONICAL; do
    run_lifecycle_process_death_case "$lifecycle_stage" "$lifecycle_boundary"
  done
done

# Exercise real native overlay persistence helpers for two fares plus cancellation while no PWA event replay runs.
# Exercise native-only lifecycle/fare/cancellation commits while the PWA is not processing events.
# Run the direct atomic SQLite transaction test explicitly; compiling the method is not execution evidence.
run_instrumentation com.kanishka.pwa.KfeNativeFullShiftAcceptanceTest#nativeTripFormCommitsRevenueAtomicallyAndRetriesIdempotently native-atomic-trip-form 1
# Prove the durable outbox retries after canonical refusal and an injected SQLite failure without duplicate revenue.
run_instrumentation com.kanishka.pwa.KfeNativeFullShiftAcceptanceTest#formOutboxSurvivesCanonicalRefusalAndSameEventRetriesWithoutDuplicateFare native-form-refusal-retry 1
run_instrumentation com.kanishka.pwa.KfeNativeFullShiftAcceptanceTest#formOutboxSurvivesInjectedCanonicalSqliteWriteFailureAndRetriesIdempotently native-form-sqlite-failure-retry 1
run_instrumentation com.kanishka.pwa.KfeNativeFullShiftAcceptanceTest#nativeOnlyShiftPersistsMultipleFaresAndCancellationAcrossStoreReopen native-full-shift 1
# Consume the same versioned 13-case shift-start vectors on Android, not merely compile the instrumentation test.
run_instrumentation com.kanishka.pwa.KfeNativeFullShiftAcceptanceTest#nativeShiftStartInterpreterMatchesSharedGoldenVectors shift-start-rule-parity 1
# Reopen the PWA with the synthetic queue events already acknowledged; canonical SQLite must catch it up independently.
run_instrumentation com.kanishka.pwa.KfeNativeFullShiftAcceptanceTest#reopeningPwaCatchesUpNativeCanonicalRecordsWithoutReplayingPendingEvents native-pwa-catch-up 1
# Continuous GPS, process-death trace resume, screen-off/reboot collection, and
# Valhalla/offline-map acceptance are intentionally dormant. Verify the native one-shot
# GPS_PROVIDER path while networking is disabled, then restore connectivity for the suite.
adb shell svc wifi disable || true
adb shell svc data disable || true
adb shell settings put global airplane_mode_on 1
adb shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true >/dev/null 2>&1 || true
adb shell settings put secure location_mode 3 || true
adb shell cmd location set-location-enabled true || true
sleep 2
(
  # Bound each console injection so a disconnected emulator console cannot hold CI.
  for _ in $(seq 1 18); do
    timeout 1s adb emu geo fix 72.85 19.01 >/dev/null 2>&1 || true
    sleep 1
  done
) &
GPS_FEED_PID=$!
run_instrumentation com.kanishka.pwa.KfeOverlaySmokeTest#nativeTripBoundarySnapshotPersistsOfflineAndIsIdempotent native-one-shot-gps-offline 1
kill "$GPS_FEED_PID" >/dev/null 2>&1 || true
wait "$GPS_FEED_PID" >/dev/null 2>&1 || true
adb shell settings put global airplane_mode_on 0
adb shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false >/dev/null 2>&1 || true
adb shell svc wifi enable || true
adb shell svc data enable || true

run_instrumentation com.kanishka.pwa.KfeOverlaySmokeTest native-overlay 19

# Run the WebView-disabled acceptances last so disabling WebView cannot affect
# any earlier PWA catch-up or lifecycle/recovery test in this instrumentation process.
adb shell am force-stop com.kanishka.pwa
run_instrumentation com.kanishka.pwa.KfeNativeFullShiftAcceptanceTest#nativeOverlayCompletesShiftWithWebViewUnavailableAndNoDuplicateRevenue native-webview-unavailable-full-shift 1
adb shell am force-stop com.kanishka.pwa
run_instrumentation com.kanishka.pwa.KfeOverlaySmokeTest#nativeOverlayCompletesFareAndCancellationUsingGesturesAndVisibleFormControlsWithoutPwaReplay native-webview-unavailable-visible-overlay 1
sha256sum "$GITHUB_WORKSPACE/artifacts/android-golden/app-debug.apk"
