# Cross-Runtime Work Domain Parity — Decision Gate

**Status:** Design gate; no production behavior changes.
**Purpose:** Establish how native Android can enforce the same Work-domain rules while the PWA/WebView is closed, without creating a second hand-maintained business implementation.

## Why this gate is required

The architecture contract requires one business authority and one canonical implementation path. The frozen full-shift requirement also requires the Android overlay to start and end a shift when the PWA is unavailable. The existing domain rules are JavaScript modules, while the closed-PWA overlay lifecycle is executed by native Android code. Calling the PWA's JavaScript domain service cannot be assumed to work when its WebView/process is unavailable.

The current source map confirms that:

- `src/domain/work/shift.js` owns opening-odometer, first-day historical-gap and gap-allocation rules.
- `src/domain/work/endShift.js` owns closing-odometer and large-distance confirmation rules.
- `src/application/work/endShift.js` enforces active-shift identity and refuses shift closure while a Trip is active.
- `src/repositories/shiftTripRepository.js` commits the Shift, revenue reconciliation, audit and mutation evidence transactionally in IndexedDB.
- `KfeCanonicalWorkStore.java` owns native transactional canonical record, operation and audit writes.
- `KfeCanonicalWorkPlugin.java` exposes generic canonical record operations, not typed native shift lifecycle commands.

A direct call into JavaScript is not a viable authority for a shift command that must remain operable with the PWA closed. Copying the JavaScript formulas into Java by hand would create two business implementations and drift risk.

## Decision gate before lifecycle production changes

Do not add production `SHIFT_START` or `SHIFT_END` commands until a small proof-of-concept demonstrates a maintainable single-source strategy for the shared rules.

### Required proof-of-concept

Use the shift-start odometer and gap-allocation rules as the first vertical slice. The proof must show:

1. One maintained, reviewable source defines rule semantics and stable reason codes.
2. The source can produce or drive both the PWA and native execution paths without separately hand-maintained formulas.
3. PWA and Android consume the same versioned golden vectors, including valid inputs, missing/invalid inputs, lower-than-prior odometer, first-day historical gap, zero gap, positive gap with missing category, and both PERSONAL and DEAD allocations.
4. Output normalization is deterministic: same input yields the same validity, numeric outputs, and reason code on both runtimes.
5. A build/test gate fails if generated artifacts are stale or cross-runtime outputs diverge.
6. The native path runs without a WebView or PWA process and does not depend on network access.
7. No changes weaken native SQLite transactionality, stable command/event identity, durable outbox/checkpoint recovery, stale-write rejection, or idempotent replay.

### Candidate strategy to test

Evaluate a small language-neutral declarative rule definition with generated runtime adapters and shared golden vectors. Generated Java/JavaScript artifacts must be treated as build outputs of one maintained source, not edited independently. The proof-of-concept must establish that the real rules can be represented safely; do not assume a generator is suitable merely because it works for simple arithmetic.

If the candidate cannot represent the actual domain behavior clearly and deterministically, stop and document the trade-off for an explicit architecture decision before introducing a second hand-maintained implementation. Do not quietly adopt duplicated Java/JavaScript formulas as the fallback.

## Required lifecycle acceptance gates after the parity decision

- Native `SHIFT_START` validates odometer, previous/business-start baseline, gap amount and required PERSONAL/DEAD allocation at the authoritative command boundary.
- Native `SHIFT_END` verifies active Shift identity, refuses an active Trip, validates closing odometer and large-distance confirmation, and atomically derives final Shift revenue/reconciliation from canonical Trips.
- Start/end commands use stable command IDs and typed outcomes, with transactional canonical records, operation results and audit rows.
- Retry after process death, lost acknowledgement, injected canonical-write failure and repeated same-command submission cannot create duplicate Shifts or repeat side effects.
- Opening the PWA after native-only completion reconciles canonical Shift/Trip state into IndexedDB without replaying already committed effects.
- An end-to-end test starts, operates and ends a shift with the PWA closed, then opens the PWA and verifies exact lifecycle state, odometers, revenue, reconciliation and no duplicates.

CI proves software-level behavior only. Physical-device background, screen-off, process-death and reboot acceptance remains mandatory.

## Scope boundary

This document is a supporting design gate, not a new business-rule authority. The business meaning remains in `KFE_BUSINESS_RULES_REGISTER.md`; formulas remain governed by `docs/KFE-CALCULATION-SPECIFICATION.md`; persisted fields and lifecycle semantics remain governed by their existing authoritative contracts.
## Cross-runtime proof and lifecycle progress log

### Stage 1 — shared PWA baseline vectors (historical)

The versioned source `spec/work-domain/shift-start-golden-vectors.json` and contract `src/tests/shiftStartGoldenVectors.contract.js` first established PWA contract coverage for previous-odometer validation, first-day historical gap, and PERSONAL/DEAD gap allocation. This was a PWA-only baseline and did not, by itself, establish cross-runtime parity.

### Stage 2 — declarative source and dual-runtime shift-start vectors (completed)

Merged in [PR #315](https://github.com/amtalwalkar-sudo/KFE-New/pull/315), main commit `9600be706d0be0b5c0b682069a44349045731d57`.

The maintained source `spec/work-domain/shift-start-rules.json` defines the shift-start odometer and gap-allocation rules. The PWA adapter retains its public reason strings; Android loads the same source as an asset and interprets it through `KfeShiftStartRuleInterpreter`. Native instrumentation reads the shared versioned vector file and compares the expected output fields. The 13 shared shift-start vectors passed in CI. This proves the narrow rule-evaluator slice only; it does not establish native lifecycle command ownership or full-shift completion while the PWA is closed.

### Stage 3 — shared shift-end odometer validation (completed)

Merged in [PR #317](https://github.com/amtalwalkar-sudo/KFE-New/pull/317), main commit `53c1fa0794f09bfd7726d3334ff1eb342f268c14`.

The declarative source and shared vector suite now cover missing, blank, nonnumeric and negative closing readings; closing below opening; zero distance; the exact 500 km boundary; over-boundary confirmation and confirmed acceptance; and absent versus explicitly null/blank start baselines. The PWA adapter preserves the existing result shape and user-facing reasons. Android instrumentation consumes the same vector asset. The KFE 2.0 CI, Android release gate, UI Isolation and Governance gates passed on the PR revision.

### Stage 4 — typed native shift lifecycle commands (next; not implemented)

The remaining blocker is production ownership: the overlay can persist trip lifecycle and fare/cancellation records while the PWA is closed, but it does not yet own a complete shift start/end lifecycle. Implement typed native `SHIFT_START` and `SHIFT_END` commands incrementally, without bypassing the shared rules or weakening current recovery guarantees.

Acceptance criteria for this stage:

1. `SHIFT_START` validates the opening odometer, prior/business-start baseline, historical gap and required PERSONAL/DEAD allocation at the native command boundary using the shared rule source.
2. `SHIFT_END` verifies the canonical active Shift, refuses closure while any Trip remains active, applies shared closing-odometer and large-distance rules, and atomically derives final revenue/reconciliation from eligible canonical completed-trip fares and cancellation fees. Blank/not-applicable cancellation fees contribute ₹0.
3. Each command has a stable operation ID and typed result; canonical Shift mutation, operation outcome and audit row commit in one SQLite transaction.
4. Repeated commands, process death, lost acknowledgement, injected SQLite failure and retry do not duplicate Shifts, audit side effects or revenue.
5. Native-only completion is reconciled into PWA IndexedDB on next open without replaying already committed effects.
6. A full-shift acceptance test starts a shift, completes trips and fare/cancellation entry, then ends the shift with the PWA/WebView closed; reopening the PWA verifies exact Shift/Trip state, odometers, revenue, reconciliation and absence of duplicates.

Keep the work split into reviewable PRs (typed command/storage boundary first, overlay integration next, then end-to-end acceptance) and preserve one open PR at a time. CI proves software behavior only; physical-device background, screen-off, process-death and reboot acceptance remains mandatory.
