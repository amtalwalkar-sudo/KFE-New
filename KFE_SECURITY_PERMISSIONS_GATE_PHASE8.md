# KFE Security and Permissions Gate — Phase 8

**Status:** Historical automated-gate record; not the current permission or release authority.  
**Current authorities:** `KFE_ANDROID_RELEASE_GATE.md`, `docs/ANDROID-NATIVE-GPS-CONTRACT.md`, and `docs/KFE-ARCHITECTURE-CONTRACT.md`.  
**Current phase status:** `KFE_LAUNCH_STATUS.md`.

This document preserves the Phase 8 checkpoint without carrying forward its superseded permission assumptions. The current product has no separate ride-notification product or notification preference workflow. Android foreground-service notifications remain platform behavior for the native ride/GPS capability.

## Current permission boundary

- Overlay permission is required for the floating native ride controls. On Android, the current startup permission gate surfaces required overlay/notification and OEM background settings before rendering app routes; the browser-only PWA is independent of those Android permissions. The overlay itself remains hidden when overlay permission is absent.
- Android notification permission supports the persistent foreground-service notification used by native ride/GPS behavior. It does not enable a separate notification product.
- Native background GPS capture requires precise location and background-location permission. KFE does not request GPS permissions as a prerequisite to starting a ride action. The user may explicitly enable background capture from the GPS status panel.
- If either required GPS permission is absent or denied, KFE must not attempt background coordinate capture. The ride action and its business timestamp remain unaffected; the durable GPS event remains pending for a later eligible trigger.
- GPS capture is offline, event-scoped and bounded to 30 seconds. No continuous tracking, route tracing, ride-distance calculation or idle timed retry service is permitted.
- Android app backup remains disabled. Sensitive credentials use Android Keystore-backed secure storage.
- Native services and providers remain non-exported except the narrowly scoped lifecycle recovery receiver for protected system boot/package-replacement events.

## Evidence boundary

Automated permission, manifest, secure-storage and native-registration contracts are evidence only for the exact source revision on which they ran. They do not prove physical-device permission-dialog behavior, OEM lifecycle behavior, GPS capture or overlay operation.

The current exact-APK and physical-device scenarios are defined by `KFE_ANDROID_RELEASE_GATE.md`. Never treat this historical Phase 8 checkpoint or a prior CI run as acceptance evidence for a newer PR head.
