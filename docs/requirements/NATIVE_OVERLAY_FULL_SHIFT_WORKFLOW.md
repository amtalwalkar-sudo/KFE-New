# Frozen Requirement: Native Overlay Full-Shift Trip Workflow

**Status:** Frozen requirement  
**Scope:** Native Android overlay and main PWA trip workflow

## Authoritative requirement

The native overlay must independently execute and persist the full trip workflow for an entire shift, including fare and cancellation submissions. Opening the main app must not be required to advance any trip state.

## Non-negotiable constraints

1. **One shared source of truth.** The native overlay and PWA must use the same authoritative trip records and business rules. The overlay must not maintain a separate, conflicting trip history or a parallel source of truth.
2. **Independent workflow execution.** With the main PWA closed or suspended, the overlay must advance through pickup, trip start, trip end, fare entry and save, cancellation entry and save, and subsequent trips for the active shift.
3. **Authoritative persistence.** Native actions and form submissions must be validated and persisted through a durable mechanism consistent with the PWA's domain rules and data model.
4. **Acknowledgement and idempotency.** Each submitted action must have a durable outcome, reject invalid transitions, and prevent duplicate trips, fares, cancellations, or repeated side effects when retried.
5. **Interruption recovery.** Pending work must survive app process death, temporary loss of connectivity, and device restart. Recovery must not silently lose or duplicate a submission.
6. **PWA synchronization.** When the PWA opens, it must reflect the records and workflow state already committed through the overlay. Opening the PWA must not be required to replay queued events in order to make the workflow progress.
7. **No false readiness claims.** CI and automated tests can establish software-level evidence, but final background, screen-off, restart, and offline behavior still requires physical-device acceptance testing.

## Required acceptance scenarios

- Keep the main PWA closed and complete multiple trips in one shift through the overlay.
- Submit and save a fare, then advance to the next pickup without opening the PWA.
- Submit and save a cancellation, then continue the shift without opening the PWA.
- Exercise the same workflow offline and with the screen off/backgrounded.
- Interrupt a submission or terminate the relevant process, then verify safe recovery.
- Retry an action and verify that no duplicate trip or financial record is created.
- Reopen the PWA and verify that it displays the same authoritative shift, trip, fare, cancellation, and workflow state.

## Implementation guardrail

Do not satisfy this requirement by optimistically advancing only the overlay UI, by adding a separate native trip database that can diverge from the PWA, or by relying on foreground PWA JavaScript to process or acknowledge actions. The implementation must establish a shared authoritative persistence and domain-operation path that works while the PWA is not running.
