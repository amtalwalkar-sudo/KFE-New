# KFE Universal Form & Action Recovery Rules

**Status:** FROZEN — current shared interaction and recovery contract.
**Scope:** Current KFE forms, ride actions, gestures, and destructive recovery operations.
**Authority:** Subordinate to the business-rule and canonical-data authorities for domain meaning.

These rules define safe interaction and recovery mechanics. They do not add product features or define domain-specific calculations.

## 1. Cancel before commitment

Any form or pending action must be abandonable without changing authoritative state. Close, Back and navigation must not silently commit. A temporary draft is not authoritative business data.

## 2. Commit is the authority boundary

A form becomes authoritative only through its intended application command and durable repository/native commit. UI state, optimistic display and queue acceptance alone are not proof of success.

## 3. Confirmed outcomes

The UI must distinguish confirmed success, confirmed failure and uncertain outcomes. Show success only after the authoritative persistence boundary confirms commitment. A retry must reuse the stable operation identity where the command contract requires it.

## 4. Undo and correction

Undo may be offered only when the complete operation can be safely reversed without invalidating later authoritative activity. When downstream records depend on the committed event, preserve history and use the applicable correction path rather than silently deleting or rewriting it.

Recovery must use the same application/domain and persistence boundaries as the original operation. A component must not manipulate a database directly to implement Undo or correction.

## 5. Navigation never commits

Navigation must not save a form, start/end a shift, change a ride state, create a fuel/Admin record, discard committed data, or terminate an operational action accidentally. Navigation and domain commitment remain separate.

## 6. Parent-scoped draft recovery

Uncommitted input may be persisted as a temporary, non-authoritative draft across application restart.

Draft identity must include the form identity and, when applicable, the canonical parent entity type and ID. Restore a draft only when the active form and parent identity match. Failed validation or commitment preserves the draft. Remove it only after successful authoritative commitment or explicit confirmed discard.

Draft recovery must remain separate from canonical business records and pending mutation recovery. Restoring a draft must never replay a committed mutation.

## 7. Destructive actions

Data reset, destructive deletion and restore require explicit confirmation and the governed recovery policy. Restore is not ordinary Undo. Existing recovery checkpoints and backup safeguards must not be bypassed.

## 8. Swipe and gesture actions

A swipe is an action mechanism, not a separate business authority. It follows the same validation, durable commit, outcome and recovery requirements as an equivalent button/form command.

## 9. Error handling

A failed or interrupted commit must not be presented as success. The application layer must determine whether the authoritative operation committed, remains pending, or failed, and must expose a safe retry/recovery outcome without duplicate side effects.

## 10. Current domain examples

- **Ride actions:** pickup, trip start, trip end and cancellation use the canonical ride lifecycle. A retry must not create a duplicate trip or financial outcome.
- **Shift odometers:** opening and closing readings are saved through the PWA-owned shift workflow and validated by the current Work rules. There is no Personal KM/Dead KM allocation or odometer-gap classification workflow.
- **Fuel and Admin forms:** saved facts use their single application/repository paths. A draft or form display is not a saved record.
- **GPS evidence:** GPS capture does not change ride state or business timestamps and never blocks the ride action.
- **Backup/reset:** destructive actions preserve the explicit confirmation and recovery safeguards.

## 11. Universal interaction checklist

For every form, button, swipe or workflow, verify:
1. What authoritative action does it request?
2. Can the user cancel before commitment?
3. Is success shown only after durable confirmation?
4. Can a retry duplicate the action?
5. Is draft recovery separate from committed data?
6. Does Back/navigation avoid accidental commitment?
7. Does recovery preserve authoritative history?

## Governing principle

> The easiest recovery should always be the safest recovery.
