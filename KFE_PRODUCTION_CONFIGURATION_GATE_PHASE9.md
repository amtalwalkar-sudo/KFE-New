# KFE Production Configuration Gate

**Status:** Automated configuration checks only. Physical-device acceptance is reported separately.

## Configuration checks

- Package version, Capacitor application ID, web output directory, PWA manifest, and required icons match the production build.
- The service worker provides the offline shell and mutation-outbox retry notification. It does not schedule periodic internet work.
- Android foreground-location permissions support the native event GPS workflow; debug mode is disabled and Android backup is disabled.
- Phone backup exports validated JSON. In-app recovery checkpoints protect restore/reset. No cloud credential, cloud upload scheduler, or automatic connectivity polling is required.
- Production source paths contain no hard-coded password or API-key literals.

## Device boundary

CI configuration contracts and generated artifacts do not prove physical-device behavior. Report Android build/smoke results and phone verification separately.
