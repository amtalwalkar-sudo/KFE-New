# Local Android PWA development

Service workers run in secure contexts. `http://localhost` is already treated as a secure context by modern browsers, so HTTPS is not strictly required for localhost; this workflow also exercises the app through a real HTTPS origin.

## Local HTTPS

1. Create `.cert/localhost.crt` and `.cert/localhost.key` with a locally trusted certificate (for example with mkcert) or use your development certificate authority.
2. Keep `.cert/` out of source control.
3. Run `node tools/https-server.mjs`.
4. Open `https://localhost:8443` on the development device and accept/trust the local certificate as required.

Never commit a private key or production certificate.

## Runtime architecture

- IndexedDB + repository is the local persistence boundary.
- Outbox is the application retry queue.
- `online`/`offline` events trigger the outbox retry engine on Android.
- Geolocation is owned by `js/services/background-tracking.js`.
- Screen wake state is owned by `js/services/wake-lock.js`.
- UI reads view-models/repository-backed state; it does not call network APIs directly.
