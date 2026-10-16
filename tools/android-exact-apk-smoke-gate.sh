#!/usr/bin/env bash
set -euo pipefail

cd "$GITHUB_WORKSPACE"
mkdir -p artifacts/android-golden
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
  adb logcat -d -t 5000 > "artifacts/android-golden/${label}-logcat.log" || true
}

inject_gps_fixes() {
  # The Android emulator accepts longitude before latitude.
  adb emu geo fix 72.8777 19.0760
  sleep 3
  adb emu geo fix 72.8697 19.0850
  sleep 3
  adb emu geo fix 72.8610 19.0930
  sleep 4
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
  if ! grep -Eq "^OK \\(${expected_count} tests?\\)$" "$log_file"; then
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
adb shell pm grant com.kanishka.pwa android.permission.ACCESS_BACKGROUND_LOCATION
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
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#gpsCollectorRecoversAfterServiceInterruption gps-service-recovery 1

# Keep the instrumentation target alive while the shell injects process death.
# The test method writes the durable trip/fare state, starts the foreground GPS
# service, records a trace baseline, then waits up to 30 seconds.
prepare_log="artifacts/android-golden/process-death-prepare-instrumentation.log"
timeout 90s adb shell am instrument -w -r -e class com.kanishka.pwa.KfeRecoveryHardeningTest#prepareGpsCollectorForProcessDeath com.kanishka.pwa.test/androidx.test.runner.AndroidJUnitRunner > "$prepare_log" 2>&1 &
prepare_instrument_pid=$!
app_pid() {
  adb shell pidof com.kanishka.pwa 2>/dev/null | tr -d '\r' | awk '{print $1}'
}
pid_before=""
process_death_ready=false
for attempt in $(seq 1 20); do
  pid_before="$(app_pid || true)"
  # The instrumentation writes this marker only after the persisted trip is
  # active and the pre-death GPS trace baseline has been captured.
  if [ -n "$pid_before" ] && adb shell run-as com.kanishka.pwa grep -q processDeathTripId shared_prefs/kfe_test_recovery.xml 2>/dev/null; then
    process_death_ready=true
    break
  fi
  sleep 1
done
if [ -z "$pid_before" ] || [ "$process_death_ready" != true ]; then
  cat "$prepare_log" >&2 || true
  capture_failure "process-death-ready-state-not-observed"
  kill "$prepare_instrument_pid" >/dev/null 2>&1 || true
  echo "Could not observe a live KFE process with its persisted GPS trace baseline." >&2
  exit 1
fi
# This PID is observed while the prepare instrumentation is still blocked in its
# bounded wait, so the process death is injected against a live process.
adb root >/dev/null 2>&1 || true
adb wait-for-device || true
if adb shell id 2>/dev/null | grep -q 'uid=0'; then
  pid_to_kill="$(app_pid || true)"
  if [ -z "$pid_to_kill" ]; then
    capture_failure "process-death-pid-lost-before-kill"
    kill "$prepare_instrument_pid" >/dev/null 2>&1 || true
    echo "KFE process disappeared before the explicit process-death injection." >&2
    exit 1
  fi
  adb shell kill -9 "$pid_to_kill" || {
    capture_failure "process-death-kill-failed"
    kill "$prepare_instrument_pid" >/dev/null 2>&1 || true
    echo "Could not kill the live KFE process for the recovery test." >&2
    exit 1
  }
  adb unroot >/dev/null 2>&1 || true
  adb wait-for-device || true
else
  # A foreground service is not reliably killable through am kill. Do not
  # silently substitute force-stop; fail this explicit process-death gate.
  capture_failure "process-death-root-unavailable"
  kill "$prepare_instrument_pid" >/dev/null 2>&1 || true
  echo "Emulator cannot run adb root; explicit foreground-process kill is unavailable." >&2
  exit 1
fi
# The instrumentation process is expected to die with the target process.
wait "$prepare_instrument_pid" >/dev/null 2>&1 || true
process_death_observed=false
for attempt in $(seq 1 25); do
  pid_after="$(app_pid || true)"
  # The kill itself must terminate the original process. Whether Android has
  # already recreated it is deliberately left to the recovery instrumentation
  # below, which verifies the persisted collector and newly recorded GPS points.
  if [ -z "$pid_after" ] || [ "$pid_after" != "$pid_before" ]; then
    process_death_observed=true
    break
  fi
  sleep 1
done
if [ "$process_death_observed" != true ]; then
  capture_failure "process-death-not-observed"
  echo "KFE process did not exit after the injected process death" >&2
  exit 1
fi
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#awaitGpsCollectorAfterProcessDeath process-death-ready 1
inject_gps_fixes
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#verifyGpsCollectorAfterProcessDeath process-death-verify 1
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#cleanupRecoveredGpsCollector gps-recovery-cleanup 1

# Screen-off is a separate lifecycle boundary. Verify the emulator really entered
# sleep before waking it and checking that the same GPS collector is still active.
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#prepareGpsCollectorForScreenOff screen-off-prepare 1
adb shell input keyevent 223
sleep 5
if ! adb shell dumpsys power | grep -q 'mWakefulness=Asleep'; then
  capture_failure "screen-off-state-not-reached"
  echo "EMULATOR DID NOT ENTER SCREEN-OFF/SLEEP STATE" >&2
  exit 1
fi
inject_gps_fixes
adb shell input keyevent 224
sleep 2
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#verifyGpsCollectorAfterScreenOff screen-off-verify 1
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#cleanupRecoveredGpsCollector gps-recovery-cleanup 1

# Reboot is tested independently from process/service restart. The boot receiver
# must resume the exact persisted collector without creating a new trip identity.
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#prepareGpsCollectorForReboot reboot-prepare 1
adb reboot || true
booted=false
for attempt in $(seq 1 120); do
  adb wait-for-device >/dev/null 2>&1 || true
  boot_state="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  if [ "$boot_state" = "1" ]; then booted=true; break; fi
  sleep 2
done
if [ "$booted" != true ]; then
  capture_failure "reboot-recovery-boot-timeout"
  echo "EMULATOR DID NOT FINISH BOOTING FOR GPS RECOVERY TEST" >&2
  exit 1
fi
adb shell input keyevent 82 || true
inject_gps_fixes
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#verifyGpsCollectorAfterReboot reboot-verify 1
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#cleanupRecoveredGpsCollector gps-recovery-cleanup 1

run_instrumentation com.kanishka.pwa.KfeOverlaySmokeTest native-overlay 19
sha256sum "$GITHUB_WORKSPACE/artifacts/android-golden/app-debug.apk"
