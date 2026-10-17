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
# Exercise real native overlay persistence helpers for two fares plus cancellation while no PWA event replay runs.
run_instrumentation com.kanishka.pwa.KfeNativeFullShiftAcceptanceTest native-full-shift 1
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
adb shell am start -n com.kanishka.pwa/.MainActivity >/dev/null
sleep 3
# Keep readiness and trace verification in one instrumentation process. A second
# instrumentation invocation can recreate the target process and invalidate the
# live-service observation made by the first invocation.
mkdir -p artifacts/android-golden
process_death_log="artifacts/android-golden/process-death-verify-instrumentation.log"
adb shell run-as com.kanishka.pwa rm -f files/process-death-recovery-ready >/dev/null 2>&1 || true
timeout 180s adb shell am instrument -w -r -e class com.kanishka.pwa.KfeRecoveryHardeningTest#verifyGpsCollectorAfterProcessDeath com.kanishka.pwa.test/androidx.test.runner.AndroidJUnitRunner > "$process_death_log" 2>&1 &
process_death_verify_pid=$!
process_death_recovery_ready=false
for attempt in $(seq 1 35); do
  if adb shell run-as com.kanishka.pwa test -f files/process-death-recovery-ready >/dev/null 2>&1; then
    process_death_recovery_ready=true
    break
  fi
  if ! kill -0 "$process_death_verify_pid" 2>/dev/null; then break; fi
  sleep 1
done
if [ "$process_death_recovery_ready" != true ]; then
  capture_failure "process-death-recovery-not-ready"
  cat "$process_death_log" >&2 || true
  kill "$process_death_verify_pid" >/dev/null 2>&1 || true
  echo "GPS collector did not become live after process-death recovery." >&2
  exit 1
fi
inject_gps_fixes
process_death_instrumentation_status=0
wait "$process_death_verify_pid" || process_death_instrumentation_status=$?
cat "$process_death_log"
if [ "$process_death_instrumentation_status" -ne 0 ] || ! grep -Eq "^INSTRUMENTATION_CODE: -1$" "$process_death_log" || ! grep -Eq "^OK \(1 test\)$" "$process_death_log"; then
  capture_failure "process-death-verify"
  echo "Process-death recovery instrumentation failed or did not report one passing test." >&2
  exit 1
fi
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#cleanupRecoveredGpsCollector gps-recovery-cleanup 1

# Screen-off is tested within one instrumentation session so the collector remains live
# while the shell locks the emulator and injects fixes.
start_instrumentation_until_ready verifyGpsCollectorAfterScreenOff screen-off-recovery-ready screen-off-verify
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
finish_instrumentation_until_ready
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#cleanupRecoveredGpsCollector gps-recovery-cleanup 1

# Reboot is tested independently from process/service restart. The boot receiver
# must resume the exact persisted collector without creating a new trip identity.
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#prepareGpsCollectorForReboot reboot-prepare 1
# Instrumentation completion can force-stop the target package. A stopped package
# will not receive BOOT_COMPLETED, so launch once after preparation to clear the
# stopped bit before the reboot under test.
adb shell am start -W -n com.kanishka.pwa/.MainActivity >/dev/null
# The instrumentation runner may mark its target package stopped on exit. Explicitly
# clear that state and verify it before reboot, otherwise Android legitimately skips
# BOOT_COMPLETED for the app and the test would not exercise the receiver.
adb shell cmd package set-stopped-state com.kanishka.pwa false || true
stopped_state="$(adb shell dumpsys package com.kanishka.pwa | grep -o 'stopped=[^ ]*' | head -1 || true)"
if [ "$stopped_state" != "stopped=false" ]; then
  capture_failure "reboot-package-still-stopped"
  echo "KFE package must be eligible for BOOT_COMPLETED before reboot; observed $stopped_state" >&2
  exit 1
fi
# Keep this user-launched test app eligible for BOOT_COMPLETED delivery; Android 13+
# can defer the broadcast for apps placed in the restricted standby bucket.
adb shell am set-standby-bucket com.kanishka.pwa active || true
adb shell dumpsys deviceidle whitelist +com.kanishka.pwa || true
sleep 3
timeout 10s adb reboot || true
booted=false
# adb wait-for-device can itself block for minutes while an emulator reboots.
# Bound each probe so the outer loop remains a real timeout and diagnostics can
# be collected if the emulator never returns.
for attempt in $(seq 1 180); do
  timeout 2s adb wait-for-device >/dev/null 2>&1 || true
  boot_state="$(timeout 2s adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  if [ "$boot_state" = "1" ]; then booted=true; break; fi
  sleep 2
done
if [ "$booted" != true ]; then
  capture_failure "reboot-recovery-boot-timeout"
  echo "EMULATOR DID NOT FINISH BOOTING FOR GPS RECOVERY TEST" >&2
  exit 1
fi
# Some emulator images restore location disabled after reboot. Enable the
# provider BEFORE unlocking: Android delivers BOOT_COMPLETED to this app after
# unlock, and the receiver must register GPS against an already-enabled provider.
adb shell cmd location set-location-enabled true || true
# Also set the legacy global mode for emulator images where the cmd service
# reports success but the secure setting is restored disabled during boot.
adb shell settings put secure location_mode 3 || true
adb shell appops set com.kanishka.pwa android:fine_location allow || true
adb shell appops set com.kanishka.pwa android:coarse_location allow || true
sleep 3
# BOOT_COMPLETED is delivered after the user has unlocked the device. Unlock
# only after location is ready so the receiver does not register into a disabled
# provider state and then appear healthy without receiving any GPS fixes.
adb shell input keyevent 224 || true
adb shell wm dismiss-keyguard || true
adb shell input keyevent 82 || true
# Some emulator builds reset location while the user is unlocking. Re-assert it
# after unlock too; KfeNativeGpsService listens for provider changes and must
# restart a persisted collector if boot recovery registered while location was off.
adb shell cmd location set-location-enabled true || true
adb shell settings put secure location_mode 3 || true
adb shell appops set com.kanishka.pwa android:fine_location allow || true
adb shell appops set com.kanishka.pwa android:coarse_location allow || true
# Let the boot receiver and fused provider settle before injecting test fixes.
sleep 8
boot_receiver_seen=false
for attempt in $(seq 1 30); do
  if adb shell run-as com.kanishka.pwa grep -q 'android.intent.action.BOOT_COMPLETED' shared_prefs/kfe_lifecycle_recovery.xml 2>/dev/null; then
    boot_receiver_seen=true
    break
  fi
  sleep 1
done
if [ "$boot_receiver_seen" != true ]; then
  capture_failure "reboot-boot-receiver-not-delivered"
  echo "BOOT_COMPLETED was not recorded by KfeLifecycleRecoveryReceiver after reboot." >&2
  exit 1
fi
# The emulator can report a successful fused-location registration while its
# provider is still settling after boot. Force a real provider-state transition
# after the boot receiver has requested recovery; the native provider receiver
# must tear down the stale callback and register a fresh one when location returns.
adb shell cmd location set-location-enabled false || true
adb shell settings put secure location_mode 0 || true
sleep 3
adb shell cmd location set-location-enabled true || true
adb shell settings put secure location_mode 3 || true
sleep 5
# Exercise the boot-started collector before launching instrumentation. Starting
# an instrumentation process can recreate the target app process and perturb the
# very service whose autonomous BOOT_COMPLETED recovery is under test.
# Parse the preferences XML on the runner, not in Android's remote shell;
# adb shell does not preserve nested quoting for sed expressions containing spaces.
reboot_trip_id="$(adb shell run-as com.kanishka.pwa cat shared_prefs/kfe_native_gps.xml | grep -o 'gps-reboot-[0-9]*' | head -1 | tr -d '\r')"
case "$reboot_trip_id" in
  gps-reboot-*) ;;
  *) capture_failure "reboot-active-trip-missing"; echo "Persisted GPS trip was not restored after reboot: $reboot_trip_id" >&2; exit 1 ;;
esac
reboot_trace_file="files/kfe_gps_trace_${reboot_trip_id}.jsonl"
# No GPS fix may have arrived before reboot preparation; treat a missing trace
# file as an empty baseline, but require the post-boot injections to create/grow it.
if adb shell run-as com.kanishka.pwa test -f "$reboot_trace_file"; then
  trace_before="$(adb shell run-as com.kanishka.pwa wc -l "$reboot_trace_file" | awk '{print $1}' | tr -d '\r')"
else
  trace_before=0
fi
for attempt in 1 2 3; do
  inject_gps_fixes
  sleep 3
done
if adb shell run-as com.kanishka.pwa test -f "$reboot_trace_file"; then
  trace_after="$(adb shell run-as com.kanishka.pwa wc -l "$reboot_trace_file" | awk '{print $1}' | tr -d '\r')"
else
  trace_after=0
fi
if ! [[ "$trace_before" =~ ^[0-9]+$ && "$trace_after" =~ ^[0-9]+$ ]] || [ "$trace_after" -le "$trace_before" ]; then
  capture_failure "reboot-gps-trace-did-not-grow"
  echo "Boot-resumed GPS collector did not persist injected fixes before instrumentation; before=$trace_before after=$trace_after" >&2
  exit 1
fi
# Now attach instrumentation to validate canonical lifecycle/fare state and
# confirm the trace grew relative to the baseline captured before reboot.
start_instrumentation_until_ready verifyGpsCollectorAfterReboot reboot-recovery-ready reboot-verify
finish_instrumentation_until_ready
run_instrumentation com.kanishka.pwa.KfeRecoveryHardeningTest#cleanupRecoveredGpsCollector gps-recovery-cleanup 1

# Reboot may reset the special overlay app-op on emulator images. Re-grant it
# after GPS reboot recovery and verify the effective mode before overlay UI tests.
adb shell appops set com.kanishka.pwa SYSTEM_ALERT_WINDOW allow
overlay_appop="$(adb shell appops get com.kanishka.pwa SYSTEM_ALERT_WINDOW | tr -d '\r')"
printf '%s\n' "$overlay_appop"
if ! printf '%s\n' "$overlay_appop" | grep -qi 'allow'; then
  capture_failure "overlay-appop-not-granted-after-reboot"
  echo "SYSTEM_ALERT_WINDOW app-op was not allowed after reboot: $overlay_appop" >&2
  exit 1
fi
run_instrumentation com.kanishka.pwa.KfeOverlaySmokeTest native-overlay 19
sha256sum "$GITHUB_WORKSPACE/artifacts/android-golden/app-debug.apk"
