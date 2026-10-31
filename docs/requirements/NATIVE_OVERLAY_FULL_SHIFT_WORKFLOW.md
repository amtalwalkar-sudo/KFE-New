# Frozen Requirement: Native Overlay Ride Workflow Within a PWA-Owned Shift

**Status:** Frozen requirement  
**Scope:** PWA shift lifecycle and native Android ride overlay

## Authoritative ownership

The **main PWA owns shift start and shift end**. The driver opens the PWA to enter the shift-start odometer and start the shift, and returns to the PWA to enter the closing odometer and end the shift.

Once a shift is active, the **native Android overlay owns the ride-stage controls and ride-event capture**. The overlay must independently execute and persist multiple rides during that active shift, including pickup, trip start, trip end, fare entry/save, and cancellation entry/save. The PWA does not need to remain open for those ride actions.

The overlay must never start, close, or otherwise mutate shift lifecycle state.

## Non-negotiable constraints

1. **One logical canonical model.** The PWA and native overlay operate on the same shift/trip identities, canonical record shape, and business rules. Separate IndexedDB and SQLite physical stores are permitted only as platform adapters with explicit synchronization and recovery.
2. **Explicit ownership boundary.** Shift creation and completion remain PWA commands. Native overlay commands may mutate only ride/trip lifecycle and associated ride data for an already-active canonical shift.
3. **Independent ride workflow.** With the PWA WebView suspended or closed after shift start, the overlay must advance through pickup, trip start, trip end, fare entry/save, cancellation entry/save, and subsequent rides.
4. **Authoritative persistence.** Native actions and form submissions must use the canonical application contract and durable native persistence; they must not create a second trip history or duplicate business rules.
5. **Acknowledgement and idempotency.** Each submitted action must have a durable outcome, reject invalid transitions, and prevent duplicate trips, fares, cancellations, or repeated side effects when retried.
6. **Interruption recovery.** Pending work must survive app process death, temporary loss of connectivity, and device restart. Recovery must not silently lose or duplicate a submission.
7. **PWA synchronization.** When the PWA opens again, it must reflect native-committed trip records and ride state. PWA replay is recovery/synchronization, not a prerequisite for the overlay to perform a ride action.
8. **No false readiness claims.** CI and automated tests establish software-level evidence only. Final background, screen-off, restart, offline, and device permission behavior still requires physical-device acceptance testing.

## Required acceptance scenarios

- Start a shift in the PWA with a valid opening odometer.
- Suspend or close the PWA WebView while keeping the active shift.
- Complete multiple trips through the overlay, including a completed ride with fare and a cancelled ride.
- Continue with another pickup without reopening the PWA.
- Exercise the ride workflow offline and with the screen off/backgrounded.
- Interrupt a submission or terminate the relevant process, then verify safe recovery.
- Retry an action and verify that no duplicate trip or financial record is created.
- Reopen the PWA and verify that it displays the same active shift and canonical trip/fare/cancellation state.
- Return to the PWA to enter the closing odometer and end the shift; verify the overlay cannot independently close it.

## Implementation guardrail

Do not add shift-start or shift-end actions to the overlay. Do not satisfy ride workflow requirements by optimistically advancing only the overlay UI, by maintaining a separate native trip database, or by relying on foreground PWA JavaScript to process or acknowledge actions. Use the canonical application boundary and native durable store for ride commands, with explicit synchronization and idempotent recovery.
