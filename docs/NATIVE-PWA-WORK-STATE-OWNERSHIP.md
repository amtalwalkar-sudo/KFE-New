# Native Android and Main PWA Work-State Ownership Contract

**Status:** Implementation contract. This document complements `docs/KFE-CANONICAL-DATA-CONTRACT.md` and `docs/GPS-VALHALLA-REMOVAL.md`.

## Goal

The native Android overlay and main PWA are two surfaces over one canonical work state. They must converge on the same shift/trip identities, lifecycle status, fare/cancellation/expense values, revenue projection, and next permitted action. They must not independently overwrite one another with stale snapshots.

## Responsibility ownership

| Capability | Native Android / Capacitor | Main PWA |
|---|---|---|
| Shift lifecycle | Read canonical shift state; refuse trip commands once the canonical shift is no longer active | Sole owner of shift start/end and closing reconciliation |
| Trip lifecycle while a shift is active | Execute overlay trip commands (pickup, ride start/end) and durably commit trip lifecycle state even when the WebView is closed | Render the same trip state; reconcile/mirror the native canonical result into IndexedDB |
| Fare/cancellation/expenses | Capture and validate raw form values; durably commit fare, toll, parking, cancellation revenue and reason to the trip record while offline | Read the same committed trip values, apply domain validation/read models, and reconcile projections on resume |
| Background execution | Overlay foreground-service lifecycle, durable workflow checkpoints, and OS restart recovery | Refresh canonical work state and reconcile the IndexedDB projection when available |
| Trip-boundary location evidence | On request, capture and persist one GPS coordinate snapshot plus the provider's actual fix timestamp at trip start/end; no continuous collection or routing | Display the persisted boundary snapshot when available; missing GPS evidence must not block trip workflow |
| Overlay UI | Render the current canonical/read-model state and pending/error feedback | Supply refreshed work state to the overlay when available |
| Revenue | Recompute the deterministic shift revenue projection from canonical trip records after a native trip/fare/cancellation commit; do not alter shift lifecycle or unrelated shift fields | Use the same trip inclusion rules and reconcile the projection when the PWA resumes |
| Sync and recovery | Durable transport queue, stable event IDs, retry, acknowledgement, OS lifecycle recovery | Replay events idempotently, reconcile records, refresh IndexedDB and send current state to the overlay |

## State synchronization protocol

1. PWA creates and ends shifts. Native trip commands are valid only against a canonical shift whose status is `ACTIVE`; the overlay must fail closed if that cannot be verified.
2. A native gesture or form submission creates one durable event with a stable event ID, original timestamp, and payload. Trip/fare/cancellation commits must remain possible while the PWA is closed.
3. Native canonical writes are limited to trip-owned fields and the derived shift revenue projection. They must not start/end a shift or change odometer reconciliation, distance, targets, advice, or unrelated shift fields.
4. A native command is not reported as saved until its canonical write is accepted. The event is replayed to the PWA with the original ID so IndexedDB/read models catch up; duplicate delivery must be idempotent and reuse of an ID with a different payload must fail.
5. The PWA applies the latest canonical snapshot to the overlay. Older snapshots cannot overwrite newer records; equal-version/different-payload updates are conflicts, not last-write-wins.
6. After process death, WebView suspension, or lost acknowledgement, the durable event is replayed with the same ID. Pending delivery must not create a second trip or duplicate accounting.
7. Location capture is a best-effort, one-shot trip-boundary snapshot. It may be unavailable offline until the device obtains a GPS fix; a missing snapshot must not block trip start/end, fare, cancellation, or persistence. GPS snapshots do not calculate or reconcile trip/shift distance.

## Acceptance gates

- **Ownership:** PWA exclusively controls shift start/end. Native trip commands verify active shift state. One-shot GPS boundary snapshots are evidence only; distance and odometer-gap handling follow the existing manual km/odometer workflow.
- **Two-way parity:** PWA → overlay and overlay → PWA changes converge on the same canonical state.
- **Offline trip execution:** with the PWA closed, native trip lifecycle, fare, toll, parking and cancellation commits survive process death and are reflected after PWA resume.
- **Race safety:** stale snapshots, shift end racing a native command, simultaneous updates, duplicate events, out-of-order events, and lost acknowledgements cannot roll back or duplicate committed work.
- **Recovery:** process death and restart retain the outbox, event identity, trip-boundary snapshots when captured, and committed state.
- **CI:** source contracts, domain tests, Android instrumentation/fault injection, and the build pass before physical-device acceptance.
- **Device acceptance:** a real phone verifies overlay touch/forms with the PWA closed, one-shot trip-boundary GPS capture (including no-fix fallback), offline persistence, foreground/background transitions, restart recovery, and parity after the PWA resumes.

A passing source-level contract is not proof of physical-device behaviour. Keep device acceptance explicitly open until demonstrated.
