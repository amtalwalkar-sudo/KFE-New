# KFE Cross-Surface Ownership Audit — 2026-10-19

**Status:** SUPPORTING / SOURCE AUDIT EVIDENCE — NOT A NEW AUTHORITY  
**Repository baseline:** `main` after form outbox SQLite-failure test merge `75913c6eec79aec1f44f7d733ae701fb708c0e11`  
**Scope:** Trace the native Android overlay's lifecycle, fare, and cancellation persistence boundaries against the PWA Work command path. This is source-level analysis, not a physical-device acceptance claim.

## Governing authorities

- `KFE-AUTHORITY-MAP.md` identifies `docs/KFE-ARCHITECTURE-CONTRACT.md` as the ownership/layer-boundary authority, `docs/KFE-CANONICAL-DATA-CONTRACT.md` as the data authority, and `docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md` as the lifecycle authority.
- The architecture contract requires one authoritative source and one implementation path; persistence is accessed through repository contracts.
- The operational lifecycle contract requires PWA and Android actions to invoke the same authoritative command/mutation path and prohibits treating UI/overlay state as proof of commit.
- Financial invariant retained from the accepted audit decision: `Shift.revenue` derives from eligible completed-trip fares plus cancellation fees; blank/not-applicable cancellation fees are ₹0.

## Source trace — observed implementation

### Native lifecycle transition

In `android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java`, `persistLifecycleAction(...)` follows this sequence:

1. Validate the saved shift against `KfeCanonicalWorkStore`.
2. Persist the native workflow checkpoint with `SharedPreferences.Editor.commit()`; failure aborts the transition.
3. Append the lifecycle action to the durable native event queue using `KfeNativeWorkActionsPlugin.recordPendingAction(...)`.
4. Write the canonical Trip stage through `persistCanonicalTripStage(...)` and `KfeCanonicalWorkStore.putRecord(...)`.
5. Only after that write succeeds, return the event ID for dispatch/acknowledgement handling.

The checkpoint/outbox/canonical boundaries have fault-injection hooks. Existing tests should continue to cover interruptions at each boundary, retry with the same logical trip/event, and acknowledgement loss.

### Native fare and cancellation

The native form commit path appends `ENTER_FARE` or `CANCEL_RIDE` to the durable event queue, then calls `persistCanonicalTripForm(...)`, and only then emits the action toward the PWA and closes the form.

`persistCanonicalTripForm(...)`:
- reads the native canonical Trip first;
- uses the saved overlay snapshot only to fill fields absent from the native record, rather than overwriting existing canonical fields;
- checks that the referenced canonical shift remains active;
- uses an operation ID derived from form mode and durable event ID;
- writes the Trip through `KfeCanonicalWorkStore.putRecord(...)`;
- refreshes the shift revenue projection from canonical Trip records.

This ordering intentionally permits native fare/cancellation work while the PWA WebView is not active. Do not remove native durable commits as a shortcut to making the PWA appear to be the sole owner.

### Native canonical store guarantees

`KfeCanonicalWorkStore.java` wraps each record update, operation outcome, and audit row in one SQLite transaction. It rejects operation-ID reuse with a different command/entity/payload, rejects stale canonical versions, and fails closed on equal timestamps with differing payloads. Legacy snapshot migration is separately idempotent and verifiable.

These are invariants to preserve during any command-boundary refactor.

### PWA persistence and replay

The PWA Work route still routes form actions through Work view/store/service/repository paths (see `KFE_PWA_FORM_SAVE_PATH_MATRIX.md`). Native actions are also queued for replay into the PWA's IndexedDB-backed view when the WebView runs again.

The code therefore has two persistence surfaces with different roles: native SQLite records used by the overlay while the PWA is closed, and PWA repository records/read models updated through the Work path. The intended relationship must be made executable and explicit: canonical native commit versus idempotent PWA projection/reconciliation. Source presence alone does not prove that every replay/failure ordering converges.

## Risks to verify — not yet classified as confirmed defects

1. **Outbox-before-canonical failure window — focused storage-failure case covered:** Android instrumentation test `formOutboxSurvivesInjectedCanonicalSqliteWriteFailureAndRetriesIdempotently()` injects a real SQLite abort after `ENTER_FARE` is durably queued. It asserts the canonical Trip remains unchanged, the event remains pending, and retrying the same event twice after removing the fault produces one fare and one revenue contribution. The test passed in PR #309 CI. This covers a deterministic SQLite insert failure; it does not prove every process-death/crash boundary or that PWA replay can never falsely report success.
2. **Lost acknowledgement after native commit:** kill/suspend the WebView after native commit but before PWA acknowledgement; replay must update the PWA representation once and retain the same Trip identity.
3. **Concurrent/stale PWA snapshot:** deliver an older PWA snapshot after a newer native canonical Trip write; canonical fields and revenue must not regress.
4. **Revenue projection convergence:** after fare/cancellation retries, compare native Shift revenue with the shared revenue derivation and PWA result. Cancelled trips with explicit blank/null cancellation fee must contribute ₹0, not fall back to a previous fare.
5. **Shift ownership boundary:** start/end remain PWA-owned. Native trip/fare/cancellation work must reject a stale overlay snapshot after the canonical shift is ended.
6. **Full shift while PWA closed — confirmed capability gap:** `KfeOverlayPlugin.java` exposes overlay lifecycle/visibility and form callbacks but no native start-shift or end-shift command. `androidOverlayLifecycle.js` returns no overlay state when `WorkService.getActiveState()` has no active shift, and the overlay is hidden in that case. `KfeOverlayService.java` explicitly says shift start/end are PWA-owned, while the frozen requirement `docs/requirements/NATIVE_OVERLAY_FULL_SHIFT_WORKFLOW.md` requires an entire shift to progress without opening the PWA. Therefore the current overlay cannot initiate a shift when none is active and has no native end-shift/reconciliation flow. This is a concrete source-level mismatch, not just an untested assumption. Implement a native-capable shift command path with the same odometer/gap validation, canonical financial projection, reconciliation and closure invariants; then prove it with an end-to-end test while the PWA remains closed. Do not bypass the existing lifecycle authority or create a second domain implementation.

## Next implementation sequence

1. Extend recovery coverage only where a specific missing boundary remains; PR #309 now covers an injected SQLite form-write failure and retry, while existing tests cover lifecycle checkpoint/outbox/canonical boundaries and stale-PWA catch-up.
2. Define the explicit canonical command contract and native capability adapter before moving business writes; retain native SQLite transactions, deterministic operation/event identity, stale-write rejection, durable outbox and lost-ack recovery.
3. Resolve the confirmed full-shift gap by making native shift start/end and required odometer/gap/reconciliation gates available without the PWA, reusing domain rules rather than duplicating them.
4. Add an end-to-end acceptance test that starts, operates, and ends a shift with the PWA closed, then opens the PWA and verifies exact state/revenue reconciliation. CI is necessary but physical-device/background/reboot acceptance remains separate.
5. Resume UI shell/form/button decoupling after the command/persistence contract is executable; presentation changes must not alter command ownership.

## Verification limits

This document records code paths inspected on the stated baseline. It does not claim that the outbox-before-canonical failure case, every crash point, full-shift-with-PWA-closed behavior, reboot GPS recovery, or physical-device UI behavior has been newly exercised. CI status must be reported from the specific run for each implementation PR.
