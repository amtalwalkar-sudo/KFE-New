#!/usr/bin/env bash
set -euo pipefail

cd "$GITHUB_WORKSPACE"
mkdir -p artifacts/android-golden
adb wait-for-device
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
  if ! adb install -r "$apk"; then
    capture_failure "${label}-install-failure"
    echo "APK install failed: ${label}" >&2
    return 1
  fi
}
run_instrumentation() {
  local test_class="$1"
  local label="$2"
  local log_file="artifacts/android-golden/${label}-instrumentation.log"
  if ! timeout 180s adb shell am instrument -w -r -e class "$test_class" com.kanishka.pwa.test/androidx.test.runner.AndroidJUnitRunner > "$log_file" 2>&1; then
    cat "$log_file"
    capture_failure "$label"
    echo "ANDROID INSTRUMENTATION FAILED OR TIMED OUT (180s): $label" >&2
    return 1
  fi
  cat "$log_file"
  if ! grep -Eq '^OK \([0-9]+ tests?\)
    capture_failure "$label"
    echo "ANDROID INSTRUMENTATION FAILED: $label" >&2
    return 1
  fi
}

install_apk "$GITHUB_WORKSPACE/artifacts/android-golden/app-debug.apk" "production-apk"
install_apk "$GITHUB_WORKSPACE/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk" "instrumentation-apk"
adb shell appops set com.kanishka.pwa android:system_alert_window allow
adb shell appops set com.kanishka.pwa android:camera allow || true
adb shell am force-stop com.kanishka.pwa
run_instrumentation com.kanishka.pwa.KfeWebViewStartupTest webview-startup
run_instrumentation com.kanishka.pwa.KfeOverlaySmokeTest native-overlay
sha256sum "$GITHUB_WORKSPACE/artifacts/android-golden/app-debug.apk"
 "$log_file" || grep -Eq 'FAILURES!!!|Tests run: [0-9]+, Failures: [1-9]|shortMsg=Process crashed|INSTRUMENTATION_RESULT: shortMsg=' "$log_file"; then
    capture_failure "$label"
    echo "ANDROID INSTRUMENTATION FAILED: $label" >&2
    return 1
  fi
}

install_apk "$GITHUB_WORKSPACE/artifacts/android-golden/app-debug.apk" "production-apk"
install_apk "$GITHUB_WORKSPACE/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk" "instrumentation-apk"
adb shell appops set com.kanishka.pwa android:system_alert_window allow
adb shell appops set com.kanishka.pwa android:camera allow || true
adb shell am force-stop com.kanishka.pwa
run_instrumentation com.kanishka.pwa.KfeWebViewStartupTest webview-startup
run_instrumentation com.kanishka.pwa.KfeOverlaySmokeTest native-overlay
sha256sum "$GITHUB_WORKSPACE/artifacts/android-golden/app-debug.apk"
