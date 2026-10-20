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
## Proof-of-concept progress log

### Stage 1 — shared PWA baseline vectors

The versioned source `spec/work-domain/shift-start-golden-vectors.json` and contract `src/tests/shiftStartGoldenVectors.contract.js` establish deterministic baseline cases for previous-odometer validation, first-day historical gap, and PERSONAL/DEAD gap allocation. The suite is registered in `src/tests/runAllContracts.js`.

**This stage is not cross-runtime parity.** At this stage the vectors are consumed by the PWA contract only; no native evaluator is claimed or implied. The parity gate remains closed until the same source vectors are consumed by a native implementation and the build/test gates prove the native and PWA results match. Production lifecycle commands must not be added before that evidence exists.

### Next stage

Evaluate a single-source rule representation/generation approach that can preserve current PWA API behavior while producing a native-compatible evaluator. Native tests must load the same versioned vector file from the repository source (through a build-time asset source path, not a manually copied duplicate). If a maintainable single-source evaluator cannot be demonstrated, stop and return with the trade-off for an explicit architecture decision.


### Stage 2 — declarative source and dual-runtime vector consumer (completed 2026-10-19)

Merged in PR [#315](https://github.com/amtalwalkar-sudo/KFE-New/pull/315), main commit `9600be706d0be0b5c0b682069a44349045731d57`.

The maintained source `spec/work-domain/shift-start-rules.json` defines the three opening-odometer/gap-allocation rules. The PWA's existing exported functions adapt this source while retaining their UI-facing reason strings. The Android build consumes the same source directory as assets; the native interpreter reads `shift-start-rules.json`, and instrumentation tests read the exact `shift-start-golden-vectors.json` asset from that directory.

The native instrumentation test compares every expected field in the 13 shared vectors. On the merged revision, PWA/build-and-test, UI Isolation, Governance, and Android release-gate checks passed. The Android release gate required a retry after an unrelated lifecycle-persistence test failed on its first attempt; the successful retry and final gate run passed. This establishes the narrow shift-start rule-evaluator proof of concept only. It does not establish native shift lifecycle command ownership or full-shift completion while the PWA is closed.

### Stage 3 — extend the single source to shift-end validation (in progress)

Before adding production native `SHIFT_END` command behavior, extend the declarative rule language and shared vectors to cover closing-odometer required/invalid handling, lower-than-opening rejection, the 500 km confirmation boundary, and explicit confirmation. Preserve the public PWA validation shape and reason strings through an adapter, and have the Android instrumentation test consume the same versioned vectors. Confirm exact handling of absent/null/blank start odometer values before changing that behavior. The source, PWA adapter, native interpreter and vector tests are being updated together on branch `proof/shared-shift-end-rules`; CI must verify that PWA and Android evaluate every vector identically before merge.
