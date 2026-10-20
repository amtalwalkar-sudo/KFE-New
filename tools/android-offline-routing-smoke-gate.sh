#!/usr/bin/env bash
set -euo pipefail

cd "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
mkdir -p artifacts/android-offline-routing

# android-emulator-runner can return before Android has completed booting.
timeout 300s adb wait-for-device
booted=false
for attempt in $(seq 1 150); do
  state="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  if [ "$state" = "1" ]; then booted=true; break; fi
  sleep 2
done
if [ "$booted" != true ]; then
  adb logcat -d -t 1000 > artifacts/android-offline-routing/boot-timeout-logcat.log || true
  echo "Android emulator did not finish system boot before offline-routing install." >&2
  exit 1
fi

install_apk_with_retry() {
  local apk="$1"
  local attempt
  for attempt in 1 2 3; do
    echo "Installing $apk (attempt $attempt/3; non-streaming)"
    if timeout 300s adb install --no-streaming -r "$apk"; then return 0; fi
    echo "APK install attempt $attempt failed; collecting emulator diagnostics." >&2
    adb shell getprop sys.boot_completed || true
    adb shell dumpsys package | head -n 30 || true
    sleep $((attempt * 5))
  done
  echo "APK installation failed after 3 attempts: $apk" >&2
  return 1
}

# A boot-complete property is not sufficient: this emulator previously lost
# system_server/package-manager services after a very slow boot, so adb install
# failed with "Broken pipe" / "Can't find service: package". Probe framework
# health explicitly and allow one controlled reboot before touching the APKs.
package_service_ready() {
  timeout 20s adb shell cmd package list packages >/dev/null 2>&1
}
if ! package_service_ready; then
  echo "Emulator reports boot complete but PackageManager is unavailable; collecting diagnostics before one reboot."
  adb logcat -d -t 5000 > artifacts/android-offline-routing/package-service-unavailable-logcat.log || true
  adb shell getprop > artifacts/android-offline-routing/package-service-unavailable-properties.txt || true
  timeout 30s adb reboot || true
  timeout 300s adb wait-for-device
  rebooted=false
  for attempt in $(seq 1 150); do
    state="$(timeout 15s adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\\r' || true)"
    if [ "$state" = "1" ] && package_service_ready; then rebooted=true; break; fi
    sleep 2
  done
  if [ "$rebooted" != true ]; then
    adb logcat -d -t 5000 > artifacts/android-offline-routing/package-service-reboot-failure-logcat.log || true
    echo "PackageManager remained unavailable after the one recovery reboot; refusing to misclassify this as an app/test failure." >&2
    exit 1
  fi
  echo "PackageManager recovered after controlled emulator reboot."
fi

install_apk_with_retry android/app/build/outputs/apk/debug/app-debug.apk
install_apk_with_retry android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk

# Satisfy Android startup permission gates in the emulator so the UI test can
# reach Offline Maps without interactive system dialogs.
adb shell pm grant com.kanishka.pwa android.permission.ACCESS_COARSE_LOCATION || true
adb shell pm grant com.kanishka.pwa android.permission.ACCESS_FINE_LOCATION || true
adb shell pm grant com.kanishka.pwa android.permission.ACCESS_BACKGROUND_LOCATION || true
adb shell pm grant com.kanishka.pwa android.permission.POST_NOTIFICATIONS || true
adb shell appops set com.kanishka.pwa SYSTEM_ALERT_WINDOW allow
adb shell settings put secure location_mode 3

# Let the app create its scoped external-files directory. Android 11+ blocks
# mkdir by the shell/run-as user when Android/data does not yet exist. Transfer
# fixtures through /data/local/tmp, then copy them as the owning app UID.
set +e
timeout 180s adb shell am instrument -w -r \
  -e class com.kanishka.pwa.KfeRecoveryHardeningTest#prepareOfflineValhallaFixtureDirectory \
  com.kanishka.pwa.test/androidx.test.runner.AndroidJUnitRunner \
  > artifacts/android-offline-routing/prepare-fixture-directory.log 2>&1
prepare_result=$?
set -e
cat artifacts/android-offline-routing/prepare-fixture-directory.log
if [ "$prepare_result" -ne 0 ] || ! grep -Fq 'OK (1 test)' artifacts/android-offline-routing/prepare-fixture-directory.log; then
  adb logcat -d -t 3000 > artifacts/android-offline-routing/prepare-fixture-logcat.log || true
  echo "Offline Valhalla fixture-directory instrumentation failed with exit code $prepare_result or missing JUnit success marker." >&2
  if [ "$prepare_result" -ne 0 ]; then exit "$prepare_result"; fi
  exit 1
fi

# Stage only the route request fixture. The tile package must be obtained through
# the real Offline Maps screen, not copied into the app by the test harness.
timeout 300s adb push work/trace-request-mumbai.json /data/local/tmp/kfe-trace-request-mumbai.json
# Avoid shell -c quoting across adb's remote-shell boundary: issue each run-as
# operation separately so Android receives unambiguous arguments.
timeout 60s adb shell run-as com.kanishka.pwa mkdir -p files
timeout 60s adb shell run-as com.kanishka.pwa cp /data/local/tmp/kfe-trace-request-mumbai.json files/valhalla-trace-request.json
test "$(adb shell run-as com.kanishka.pwa wc -c files/valhalla-trace-request.json | awk '{print $1}' | tr -d '\r')" -gt 0

# Warm the real app before instrumentation. On a cold emulator, Chromium WebView
# initialization can take longer than AndroidX startActivitySync's fixed 45s
# idle deadline. Launch asynchronously and wait until MainActivity is resumed
# so the UI test measures map download behaviour rather than cold WebView startup.
echo "Warming MainActivity/WebView before UI-driven offline map download."
timeout 30s adb shell am start -n com.kanishka.pwa/.MainActivity
ui_ready=false
for attempt in $(seq 1 90); do
  if adb shell dumpsys activity activities 2>/dev/null | grep -q 'mResumedActivity.*com.kanishka.pwa/.MainActivity'; then
    ui_ready=true
    break
  fi
  sleep 2
done
if [ "$ui_ready" != true ]; then
  adb logcat -d -t 4000 > artifacts/android-offline-routing/ui-startup-timeout-logcat.log || true
  echo "MainActivity did not reach resumed state before the UI-download test." >&2
  exit 1
fi

# Exercise the actual user-facing download button while networking is available.
set +e
echo "Starting actual UI-driven Mumbai offline map download and integrity verification."
timeout 1500s adb shell am instrument -w -r \
  -e class com.kanishka.pwa.KfeRecoveryHardeningTest#downloadOfflineMapThroughUserFacingScreen \
  com.kanishka.pwa.test/androidx.test.runner.AndroidJUnitRunner \
  > artifacts/android-offline-routing/ui-download-instrumentation.log 2>&1
download_result=$?
set -e
cat artifacts/android-offline-routing/ui-download-instrumentation.log
if [ "$download_result" -ne 0 ] || ! grep -Fq 'OK (1 test)' artifacts/android-offline-routing/ui-download-instrumentation.log; then
  adb logcat -d -t 4000 > artifacts/android-offline-routing/ui-download-failure-logcat.log || true
  echo "UI-driven offline map download failed with exit code $download_result or missing JUnit success marker." >&2
  if [ "$download_result" -ne 0 ]; then exit "$download_result"; fi
  exit 1
fi

# Prove the verified package survives the app process being stopped before
# network is disabled and the native engine is exercised.
adb shell am force-stop com.kanishka.pwa
test "$(adb shell run-as com.kanishka.pwa wc -c files/offline-maps/regions/mumbai-metro/valhalla-tiles.tar | awk '{print $1}' | tr -d '\r')" -gt 0
test "$(adb shell run-as com.kanishka.pwa wc -c files/offline-maps/regions/mumbai-metro/map-metadata.json | awk '{print $1}' | tr -d '\r')" -gt 0

# Disable emulator-managed external network paths before invoking native Valhalla.
adb shell svc wifi disable
adb shell svc data disable || true
adb shell cmd connectivity airplane-mode enable
sleep 3
test "$(adb shell settings get global airplane_mode_on | tr -d '\r')" = "1"

set +e
echo "Starting on-device offline Valhalla route test with network disabled."
timeout 1200s adb shell am instrument -w -r \
  -e class com.kanishka.pwa.KfeRecoveryHardeningTest#installedOfflineValhallaRoutesWithNetworkDisabled \
  com.kanishka.pwa.test/androidx.test.runner.AndroidJUnitRunner \
  > artifacts/android-offline-routing/instrumentation.log 2>&1
result=$?
set -e
cat artifacts/android-offline-routing/instrumentation.log
if [ "$result" -ne 0 ]; then
  adb logcat -d -t 3000 > artifacts/android-offline-routing/failure-logcat.log || true
  echo "Offline Valhalla instrumentation failed with exit code $result." >&2
  exit "$result"
fi
grep -Fq 'INSTRUMENTATION_CODE: -1' artifacts/android-offline-routing/instrumentation.log
grep -Fq 'OK (1 test)' artifacts/android-offline-routing/instrumentation.log
! grep -Eq 'FAILURES!!!|Tests run: [0-9]+, Failures: [1-9]|shortMsg=Process crashed' artifacts/android-offline-routing/instrumentation.log
