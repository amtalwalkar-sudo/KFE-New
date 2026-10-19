# Native Shift Command Ownership Map

**Status:** Supporting implementation map, not a new authority.  
**Baseline:** `main` after native Work command contract PR #311.  
**Purpose:** Record the source-backed ownership map and unresolved decisions required before implementing native shift start/end.

## Governing authorities

- `docs/KFE-ARCHITECTURE-CONTRACT.md` — layer ownership and one-authority rule.
- `docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md` — lifecycle semantics.
- `docs/KFE-CANONICAL-DATA-CONTRACT.md` — canonical fields and persisted-data authority.
- `docs/KFE-CALCULATION-SPECIFICATION.md` and `KFE_BUSINESS_RULES_REGISTER.md` — formulas/business meaning.
- `docs/requirements/NATIVE_OVERLAY_FULL_SHIFT_WORKFLOW.md` — PWA-closed full-shift acceptance requirement.
- `docs/design/NATIVE-WORK-COMMAND-CONTRACT.md` — proposed command envelope, outcomes, and failure/replay gates.

This map is supporting evidence. It does not amend the authoritative contracts.

## 1. Existing PWA/application path — source facts

### Shift start

- `src/application/work/workService.js` exposes `validateShiftStartOdometer`, `validateFirstDayShiftStartOdometer`, and `validateGapAllocation`, delegating to `src/domain/work/shift.js`.
- `validateShiftStartOdometer` requires a finite positive current odometer, rejects a reading below the prior odometer, and calculates the intervening gap.
- `validateFirstDayShiftStartOdometer` validates against the business-start odometer and calculates historical distance.
- `validateGapAllocation` requires any positive gap to be allocated to `PERSONAL` or `DEAD`; it returns the respective allocation amounts.
- `ShiftTripRepository.createShift` normalizes input and creates an ACTIVE Shift with odometer, opening Personal KM/Dead KM, historical gap, business-start baseline, timestamps and initial financial values. It writes the Shift and audit/mutation record in one IndexedDB transaction.
- `WorkService.startShift(data)` currently calls `ShiftTripRepository.createShift(data)`, then `mirrorCanonicalRecord('SHIFT', result)`, then checkpoints. The method itself does not call the three odometer/gap validators before repository creation.

**Important implementation question:** The validation methods exist in the application service, but the shown `startShift` method does not enforce them. Before moving this use case to native, trace every caller and establish the single authoritative validation location. Do not assume UI validation alone is sufficient; command preconditions must be enforced at the authoritative mutation boundary.

### Shift end

- `src/application/work/endShift.js` (`completeEndShift`) checks that the requested Shift is the active Shift and rejects closure while an active Trip exists.
- It delegates odometer validation to `src/domain/work/endShift.js`, which requires a finite non-negative closing reading, rejects a reading below the opening odometer, and can require confirmation for unusually large distance.
- It calls `ShiftTripRepository.completeShift` only after those checks.
- `ShiftTripRepository.completeShift` performs a single IndexedDB read/write transaction across Shift, Trip, pending-mutation and audit stores. It verifies the Shift is ACTIVE, loads its Trips, derives `Shift.revenue` through `deriveLiveRevenue`, creates `revenueReconciliation`, validates end odometer again, calculates vehicle distance/duration, and writes the terminal Shift plus audit/mutation record.
- `WorkService.endShift` first tries to import remaining native GPS traces and calculate movement reconciliation. If this enrichment fails, it records an `UNAVAILABLE` reconciliation result and still delegates closure to `completeEndShift`. This distinction must be preserved or deliberately changed only through the authoritative business/lifecycle contract.

### Existing canonical boundary and native adapter

- `src/application/work/canonicalWorkBoundary.js` routes generic `putRecord/getRecord/listRecords/getOperation` to `WorkRuntimePorts.canonicalWork` when available, otherwise to `BrowserCanonicalWorkService`. It creates operation IDs, but the current generic `putRecord` interface is record-oriented; it does not itself expose a typed `SHIFT_START` or `END_SHIFT` use case.
- `android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkPlugin.java` exposes generic record, operation and legacy migration calls. It does not validate/execute shift lifecycle commands.
- `android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java` is the native transactional canonical record store. Its transactional operation/audit semantics and stale-write/idempotency protections must remain intact.
- `src/infrastructure/android/kfeOverlay.js` exposes overlay visibility, permission, prepare/update, and form-saved callbacks. It has no start-shift/end-shift command.
- `android/app/src/main/java/com/kanishka/pwa/KfeOverlayPlugin.java` likewise exposes visibility/permission and callbacks only, not typed shift commands.
- `src/infrastructure/android/androidOverlayLifecycle.js` calls `WorkService.getActiveState()` and returns no overlay state if there is no active Shift. Thus the overlay cannot currently bootstrap a new shift while the PWA is closed.
- The overlay service contains native trip/fare/cancellation persistence, but comments and the existing audit explicitly leave shift start/end PWA-owned.

## 2. Authority map

| Responsibility | Current source | Required native design |
|---|---|---|
| Start odometer / prior-boundary validation | `src/domain/work/shift.js`, called through `WorkService` validation methods | Enforce inside shared command semantics / canonical commit path; not just in UI |
| First-day historical odometer gap | `validateFirstDayShiftStartOdometer` | Preserve business-start baseline and historical-gap semantics exactly |
| Gap allocation | `validateGapAllocation`; Shift opening allocation fields | Require and persist Personal KM or Dead KM allocation with the shift-start command |
| Create active Shift | `ShiftTripRepository.createShift` | Native-capable command must create the canonical Shift exactly once and return the committed record |
| End odometer and high-distance confirmation | `src/domain/work/endShift.js` via `completeEndShift` | Same rules at the authoritative command boundary; retries cannot close twice |
| Movement reconciliation | `WorkService.endShift` + `MovementAccountingService` + routing/GPS ports | Keep reconciliation as domain/application work; explicitly preserve `UNAVAILABLE` and evidence when GPS recovery fails |
| Shift revenue | `src/domain/work/liveRevenue.js` | One accepted rule: eligible completed-trip fares plus cancellation fees; blank/not-applicable cancellation fee = ₹0 |
| Revenue reconciliation | `src/domain/work/revenueReconciliation.js` | Reuse same calculation semantics; do not implement a competing overlay formula |
| Durable native persistence | `KfeCanonicalWorkStore` | Transactional record + operation outcome + audit; stable command identity; fail-closed stale writes |
| PWA catch-up | `canonicalWorkRecovery.js` / repository canonical read boundary | Native canonical records become the projection source on reopen; stale IndexedDB must not overwrite native state |
| Overlay activation without a Shift | `androidOverlayLifecycle.js` currently hides it | Add a start-shift entry state that does not depend on an already active Shift, without creating a second workflow |

## 3. Critical design gate: shared rules across JavaScript and native code

The PWA domain rules are currently JavaScript; the overlay can act when the PWA/WebView is not running. A native command therefore cannot simply call `WorkService` at execution time.

Before implementing native shift commands, choose and test one deliberate strategy:
1. a genuinely shared executable domain artifact usable by both runtimes, if technically viable; or
2. a native implementation with a single authoritative specification and parity vectors that prove exact equivalence, with no independent UI-level validation authority.

Do not quietly copy formulas into a second surface. If a native implementation is necessary, make parity explicit and cover boundary values, invalid input, retry behavior, and the canonical record fields in tests. Any conflict with the one-implementation rule must be resolved at the architecture-contract level before production code lands.

## 4. Required pre-implementation checks

- [ ] Trace every call site of `WorkService.startShift` and the odometer/gap validators; identify which code currently collects and persists allocation evidence.
- [ ] Confirm whether validation is enforced again inside any authoritative persistence/native path; if not, design that enforcement before adding native start.
- [ ] Trace end-shift form inputs, high-distance confirmation and movement reconciliation failure behavior.
- [ ] Verify canonical field mapping for Shift start/end, opening Personal KM/Dead KM, historical gap, reconciliation, duration, status and revenue.
- [ ] Specify command ID persistence for start before a Shift exists and for end against an existing Shift; same-ID/same-payload retry must return the same outcome.
- [ ] Define how native shift-start/end commands atomically persist record, operation outcome and audit evidence using the existing store guarantees.
- [ ] Add contract/parity tests before production implementation.
- [ ] Add a PWA-closed acceptance test for a complete shift and PWA catch-up; keep physical-device background, screen-off, reboot and offline acceptance separate.

## 5. Non-claims

This is a source map, not an implementation. It does not claim native shift start/end exists, that UI-level start validation is sufficient, or that PWA-closed full-shift operation has passed. Those remain explicit gates.
