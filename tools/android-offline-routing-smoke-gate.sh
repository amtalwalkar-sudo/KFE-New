#!/usr/bin/env bash
set -euo pipefail

cd "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
mkdir -p artifacts/android-offline-routing

# android-emulator-runner can return from its boot helper while the emulator's
# package manager is still starting on slow/loaded hosted runners. Wait for the
# system boot property explicitly before installing either APK.
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
# These are test APKs installed only on this disposable CI emulator. Avoid
# adb's streamed-install path: on slow hosted emulators it can hit Android's
# package-integrity verification timeout even though the APK built successfully.
# --no-streaming uses the classic push/install path; retry transient package
# manager contention and preserve each failure in the job log.
install_apk_with_retry() {
  local apk="$1"
  local attempt
  for attempt in 1 2 3; do
    echo "Installing $apk (attempt $attempt/3; non-streaming)"
    if timeout 300s adb install --no-streaming -r "$apk"; then
      return 0
    fi
    echo "APK install attempt $attempt failed; checking emulator/package manager before retry." >&2
    adb shell getprop sys.boot_completed || true
    adb shell dumpsys package | head -n 30 || true
    sleep $((attempt * 5))
  done
  echo "APK installation failed after 3 attempts: $apk" >&2
  return 1
}
install_apk_with_retry android/app/build/outputs/apk/debug/app-debug.apk
install_apk_with_retry android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
# Use the smaller, separately published Alibag package so the on-device
# test exercises a real region extract without exhausting emulator RAM/time.
timeout 300s adb push work/area-alibag.tar /data/local/tmp/valhalla-tiles.tar
test "$(adb shell ls -l /data/local/tmp/valhalla-tiles.tar | awk '{print $5}' | tr -d '\r')" -gt 0

# Disable emulator-managed external network paths before invoking the native engine.
adb shell svc wifi disable
adb shell svc data disable || true
# Use ConnectivityService's supported shell command to toggle airplane mode.
# Sending ACTION_AIRPLANE_MODE directly is denied on current Android emulator images.
adb shell cmd connectivity airplane-mode enable
sleep 3
test "$(adb shell settings get global airplane_mode_on | tr -d '\r')" = "1"

set +e
# Valhalla must load the local tile extract and route with networking disabled; allow slow CI disks to finish.
timeout 600s adb shell am instrument -w -r \
  -e class com.kanishka.pwa.KfeRecoveryHardeningTest#installedOfflineValhallaRoutesWithNetworkDisabled \
  com.kanishka.pwa.test/androidx.test.runner.AndroidJUnitRunner \
  > artifacts/android-offline-routing/instrumentation.log 2>&1
result=$?
set -e
cat artifacts/android-offline-routing/instrumentation.log
test "$result" -eq 0
grep -Eq '^INSTRUMENTATION_CODE: -1$' artifacts/android-offline-routing/instrumentation.log
grep -Eq '^OK \(1 test\)$' artifacts/android-offline-routing/instrumentation.log
! grep -Eq 'FAILURES!!!|Tests run: [0-9]+, Failures: [1-9]|shortMsg=Process crashed' artifacts/android-offline-routing/instrumentation.log
