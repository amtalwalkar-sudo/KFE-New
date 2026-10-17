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

install_apk_with_retry android/app/build/outputs/apk/debug/app-debug.apk
install_apk_with_retry android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk

# Let the app create its scoped external-files directory. Android 11+ blocks
# mkdir by the shell/run-as user when Android/data does not yet exist. Transfer
# fixtures through /data/local/tmp, then copy them as the owning app UID.
timeout 60s adb shell am instrument -w -r \
  -e class com.kanishka.pwa.KfeRecoveryHardeningTest#prepareOfflineValhallaFixtureDirectory \
  com.kanishka.pwa.test/androidx.test.runner.AndroidJUnitRunner \
  > artifacts/android-offline-routing/prepare-fixture-directory.log 2>&1
cat artifacts/android-offline-routing/prepare-fixture-directory.log
grep -Fq 'OK (1 test)' artifacts/android-offline-routing/prepare-fixture-directory.log

APP_FILES_DIR=/sdcard/Android/data/com.kanishka.pwa/files
timeout 300s adb push work/area-alibag.tar /data/local/tmp/kfe-area-alibag.tar
timeout 60s adb shell run-as com.kanishka.pwa cp /data/local/tmp/kfe-area-alibag.tar "$APP_FILES_DIR/valhalla-tiles.tar"
timeout 300s adb push work/trace-request-alibag.json /data/local/tmp/kfe-trace-request-alibag.json
timeout 60s adb shell run-as com.kanishka.pwa cp /data/local/tmp/kfe-trace-request-alibag.json "$APP_FILES_DIR/valhalla-trace-request.json"
test "$(adb shell run-as com.kanishka.pwa wc -c "$APP_FILES_DIR/valhalla-tiles.tar" | awk '{print $1}' | tr -d '\r')" -gt 0
test "$(adb shell run-as com.kanishka.pwa wc -c "$APP_FILES_DIR/valhalla-trace-request.json" | awk '{print $1}' | tr -d '\r')" -gt 0

# Disable emulator-managed external network paths before invoking native Valhalla.
adb shell svc wifi disable
adb shell svc data disable || true
adb shell cmd connectivity airplane-mode enable
sleep 3
test "$(adb shell settings get global airplane_mode_on | tr -d '\r')" = "1"

set +e
timeout 600s adb shell am instrument -w -r \
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
