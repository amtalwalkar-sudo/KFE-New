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

capture_failure() {
  local label="$1"
  adb logcat -d -t 5000 > "artifacts/android-golden/${label}-logcat.log" || true
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
adb shell appops set com.kanishka.pwa android:system_alert_window allow
adb shell appops set com.kanishka.pwa android:camera allow || true
adb shell am force-stop com.kanishka.pwa
run_instrumentation com.kanishka.pwa.KfeWebViewStartupTest webview-startup 1
run_instrumentation com.kanishka.pwa.KfeOverlaySmokeTest native-overlay 5
sha256sum "$GITHUB_WORKSPACE/artifacts/android-golden/app-debug.apk"
