# Frozen Requirement: Native Overlay Ride Workflow Within a PWA-Owned Shift

**Status:** Frozen implementation requirement  
**Authority:** `docs/KFE-ARCHITECTURE-CONTRACT.md`, `docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md`, and `KFE_BUSINESS_RULES_REGISTER.md`.

## Ownership

The PWA main app owns Shift start and Shift end, including opening and closing odometer entry.

During an active Shift, the native Android overlay owns ride-stage controls and ride-event capture. It must support multiple rides, fare entry/save or explicit skip, and cancellation/cancellation-fee entry without requiring the PWA WebView to remain open.

The overlay cannot create, close or otherwise mutate Shift lifecycle state.

## One canonical model, platform-specific command adapters

PWA and Android use the same canonical Shift/Trip identities, record meanings, lifecycle invariants and domain business rules. They have platform-specific command and persistence adapters:

- PWA commands enter the Work application service and browser/Android repository adapter.
- Android overlay commands enter the native command adapter and commit transactionally to canonical SQLite. This must work while the WebView is unavailable.
- The durable native event journal synchronizes committed native actions into the PWA read projection and supports acknowledgement/recovery. Replay must not create a second business commit.

Separate IndexedDB and SQLite physical stores are allowed only as platform persistence implementations of the same canonical model. They are not separate business histories.

## Non-negotiable constraints

1. Shift start/end remain PWA-owned.
2. Native ride commands are limited to an already-active canonical Shift.
3. Native commits must enforce the same lifecycle and validation invariants as the PWA path.
4. Every command has a stable operation identity, durable outcome, idempotent retry and safe interruption recovery.
5. Native fare/cancellation form commits update the canonical Trip and Shift revenue projection atomically; the native projection is only a parity-constrained persistence mirror of the domain rule.
6. GPS capture is event-time only at the four agreed events, offline-capable, bounded and optional. It never blocks a ride action or changes its timestamp.
7. When the PWA opens, it synchronizes native-committed canonical records without a duplicate write.
8. No continuous tracking, route/distance calculation, dead-kilometre accounting, reconciliation, notification-based ride controls or second overlay workflow may be added.

## Acceptance scenarios

- Start a Shift in the PWA with opening odometer.
- Suspend/close the PWA WebView while the Shift remains active.
- Complete multiple rides in the overlay, including a completed ride with fare and a cancelled ride with cancellation fee.
- Continue with another pickup without reopening the PWA.
- Exercise ride actions offline and with screen/background interruptions.
- Interrupt a submission, then verify recovery and retry without duplicate business facts.
- Reopen the PWA and verify the same active Shift and canonical Trip/fare/cancellation state.
- Return to the PWA for closing odometer and Shift end; verify overlay cannot close the Shift.

## Implementation guardrail

Do not route native overlay submissions through foreground PWA JavaScript as a prerequisite. Do not maintain a separate native trip history. Use the native command/persistence adapter for native-first durable commits, then synchronize through the event journal. The UI must display success only after the native transaction reports a durable outcome.
