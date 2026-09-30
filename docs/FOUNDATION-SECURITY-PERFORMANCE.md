# KFE Foundation: Persistence, Performance & Session Security

## IndexedDB
- Versioned database: `kfe`, schema version 1.
- Stores reserved from day one: `state`, `rides`, `logs`, `settings`.
- Every future schema change increments the DB version and performs an explicit `onupgradeneeded` migration.
- Existing stores/data must never be silently dropped.
- Repository code is the only application persistence boundary.

## Performance
- Initial JS budget: 250 KiB.
- Initial CSS budget: 100 KiB.
- Critical path is limited to app composition, UI shell, state and repository.
- Secondary modules have an explicit lazy-loading boundary.
- Future CI should fail when measured critical assets exceed the budgets.

## Session security
- Authentication tokens are forbidden in localStorage/sessionStorage.
- Preferred authenticated deployment uses Secure, HttpOnly, SameSite cookies.
- Browser JS cannot read HttpOnly cookies; it only sends requests through the authenticated transport.
- If a backend is unavailable, session metadata may remain ephemeral in memory only.
- PII should be minimized and, where it must be persisted, protected by an encryption design appropriate to the deployment; encryption keys must not be hard-coded into the client bundle.

## Compatibility
These foundations do not alter the business rules or visual UI. They establish boundaries for future migration and harden the PWA without coupling the UI shell to storage, networking, or authentication implementation details.
