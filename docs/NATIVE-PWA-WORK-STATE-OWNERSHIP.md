# Native Android and Main PWA Work-State Ownership Contract

**Status:** Implementation contract. This document complements `docs/KFE-CANONICAL-DATA-CONTRACT.md` and `docs/ANDROID-NATIVE-GPS-CONTRACT.md`.

## Goal

The native Android overlay and main PWA are two surfaces over one canonical work state. They must converge on the same committed shift/trip identity, lifecycle status, fare/revenue, and next permitted action. They must not maintain competing business authorities.

## Responsibility ownership

| Capability | Native Android / Capacitor | Main PWA |
|---|---|---|
| Background execution | Foreground-service lifecycle, permissions, screen-off collection, OS restart recovery | Report recording status and assess trace completeness |
| GPS evidence | Collect, timestamp, deduplicate transport-level repeats, and durably persist raw samples | Filter traces, calculate provisional distance, route-match, reconcile authoritative movement |
| Overlay UI | Render compact state, touch/swipe capture, form input, pending/error feedback | Own the workflow model and provide the state rendered by the overlay |
| Work actions | Persist an event ID, timestamp, payload, and retry state in the durable outbox | Validate the action against the current canonical state and commit the business transition |
| Fare/cancellation/expenses | Capture raw user input and preserve an unacknowledged submission | Validate inputs, update canonical trip/shift data, apply expense/revenue rules |
| Revenue, distance, targets, advice, reports | Display supplied values; do not independently derive business results | Own authoritative business calculations and advice decisions |
| Notifications | Deliver a notification requested by the application | Decide whether a business notification is warranted |
| Sync and recovery | Durable transport queue, retry, acknowledgement, OS lifecycle recovery | Reconcile canonical records, apply conflict rules, refresh calculations and both surfaces |

## State synchronization protocol

1. A native gesture or form submission creates one durable event with a stable event ID and original timestamp.
2. The native overlay may show the action as **pending**, but must not present a business transition as committed before PWA confirmation.
3. The PWA processes events through one FIFO queue, validates them against current canonical state, and commits the transition idempotently.
4. Only after the canonical commit does the PWA acknowledge the original event ID. Duplicate delivery must return the same outcome; reusing an ID with a different payload must fail.
5. The overlay applies the acknowledged state and renders the same committed stage and next action as the PWA.
6. PWA-originated changes must update the overlay from the canonical read model. Older snapshots cannot overwrite newer records; equal-version/different-payload updates are conflicts, not last-write-wins.
7. After process death, WebView suspension, network loss, or lost acknowledgement, the durable event is replayed with the same ID. A pending action must not create a second trip or duplicate accounting.
8. The native collector may continue gathering raw GPS while the PWA is suspended. Calculated distance may be temporarily stale until the PWA resumes and recalculates from the durable trace; the overlay must not manufacture a competing authoritative figure.

## Acceptance gates

- **Ownership:** no authoritative fare, revenue, movement-distance, target, advice, or lifecycle business rules are independently implemented in native overlay code.
- **Two-way parity:** PWA → overlay and overlay → PWA changes converge on the same canonical state.
- **Race safety:** stale snapshots, simultaneous updates, duplicate events, out-of-order events, and lost acknowledgements cannot roll back or duplicate committed work.
- **Recovery:** process death and restart retain the outbox, event identity, raw GPS trace, and committed state.
- **CI:** source contracts, domain tests, Android instrumentation/fault injection, and the build pass before physical-device acceptance.
- **Device acceptance:** a real phone verifies screen-off collection, overlay touch handling, foreground/background transitions, restart recovery, and parity after the PWA resumes.

A passing source-level contract is not proof of physical-device behaviour. Keep device acceptance explicitly open until demonstrated.
