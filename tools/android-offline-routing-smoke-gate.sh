#!/usr/bin/env bash
set -euo pipefail

cd "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
mkdir -p artifacts/android-offline-routing
adb wait-for-device
timeout 120s adb install -r android/app/build/outputs/apk/debug/app-debug.apk
timeout 120s adb install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
# Use the smaller, separately published Alibag package so the on-device
# test exercises a real region extract without exhausting emulator RAM/time.
timeout 300s adb push work/area-alibag.tar /data/local/tmp/valhalla-tiles.tar
test "$(adb shell ls -l /data/local/tmp/valhalla-tiles.tar | awk '{print $5}' | tr -d '\r')" -gt 0

# Disable emulator-managed external network paths before invoking the native engine.
adb shell svc wifi disable
adb shell svc data disable || true
adb shell settings put global airplane_mode_on 1
adb shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true >/dev/null
sleep 3
test "$(adb shell settings get global airplane_mode_on | tr -d '\r')" = "1"

set +e
timeout 240s adb shell am instrument -w -r \
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
