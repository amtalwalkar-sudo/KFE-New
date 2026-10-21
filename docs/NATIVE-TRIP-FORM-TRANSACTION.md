# Native Trip Form Transaction

Status: **Canonical transaction implementation merged to main (PR #323); automated CI and WebView-unavailable full-shift acceptance passed. Physical-device GPS snapshot acceptance is a separate open gate and does not block acceptance of this transaction contract.**

## Decision

KFE does not need a headless JavaScript runtime merely to persist ordinary native-overlay fare and cancellation submissions. The overlay submits a bounded command to the existing canonical Android SQLite store. SQLite transactions provide atomicity; native code enforces minimum invariants needed to keep durable records and the financial projection consistent. The PWA retains richer, evolving domain rules, reporting and reconciliation.

This is the pragmatic split between **simple accumulation** and **complex business rules**. It is not permission for the PWA to repair an accepted fare later: ordinary accepted commands must already be financially correct when committed.

## Financial authority (explicit decision)

**Option A is the authority for KFE:** `Shift.revenue` is derived from eligible completed-trip fares plus cancellation fees. Completed trips with `fareDetailsSkipped=true` contribute ₹0. Blank or not-applicable cancellation fees are normalized to ₹0; valid non-negative cancellation fees are included once. This rule applies to the canonical SQLite transaction, PWA projections/reporting, native overlay, and tests. Reopening the PWA is not a repair step for an accepted native submission.

## Implemented on main

- `KfeCanonicalWorkStore.commitTripForm(operationId, mode, trip)` commits the trip form, derived `Shift.revenue` / `liveFareRevenue`, durable operation outcome and audit row in one SQLite transaction.
- It rejects missing identity, unsupported mode, wrong terminal trip state, invalid/negative amounts, stale/conflicting trip versions, mismatched shift identity and an inactive canonical shift.
- `Shift.revenue` is recalculated from canonical trip records for that shift: eligible completed-trip fares plus cancellation fees. Skipped fare details do not contribute; a blank/not-applicable cancellation fee is normalized to ₹0.
- Repeated use of the same operation ID and identical payload returns the durable prior result without applying the command again. Reuse with a different command/payload is rejected.
- `KfeOverlayService.persistCanonicalTripForm` now calls this single transaction instead of committing the trip and revenue projection in separate transactions. The old `SUPPORTING_ONLY` trip revenue-authority marker is removed because trip fares are inputs to the authoritative shift projection.
- Native form amount and cancellation-reason validation lives in the Android-independent `KfeNativeTripFormRules` helper, so presentation changes do not own the validation policy; canonical store validation remains the final persistence boundary.
- Blank optional amounts remain valid; negative, malformed, and non-finite amounts are rejected before command creation, and the canonical SQLite transaction independently enforces persistence-critical amount invariants.
- Android instrumentation exercises atomic fare projection and idempotent retry. Full-shift acceptance exercises multiple fares, cancellation fees, blank cancellation fees, replay and store reopen; the release gate also verifies native-only operation with WebView unavailable.

## Deliberate limits and acceptance gates

- The native command enforces persistence-critical invariants, not every rich PWA rule. Any rule essential to deciding whether a native submission is valid must be represented in the command contract or the operation must wait for the PWA.
- This change does not establish that all PWA forms or shift start/end can run without the WebView; shift start/end remain PWA-owned.
- The durable native outbox/checkpoint recovery remains in place. A queued transport event is not itself proof of a canonical commit.
- The canonical database remains `kfe_canonical_work.db`; no second SQLite store is introduced.
- Regression protection must continue to run Android instrumentation for fare/cancellation submission with WebView unavailable, retry after commit/lost acknowledgement, PWA catch-up, and process-death recovery. GPS acceptance is governed separately by docs/ANDROID-NATIVE-GPS-CONTRACT.md and is limited to one-shot trip-boundary snapshots; continuous screen-off trace collection and restart trace recovery are not part of the active GPS scope.

## Native form command construction boundary

- The native overlay reads current widget/draft values and invokes `KfeNativeTripFormRules` to build the bounded fare or cancellation payload. The helper owns trimming/null normalization and the explicit INCLUDED/EXCLUDED treatment values; it does not access Android views or commit data.
- `KfeOverlayService` remains responsible for active-shift verification, durable event identity/queueing, canonical SQLite commit, and reporting the outcome. Payload construction extraction must not move or split that transaction.
- The WebView-disabled full-shift instrumentation acceptance checks payload values and treatment mapping before continuing through the real native submission workflow.
- Native form draft serialization now lives in `KfeNativeTripFormDraftStore`: it loads, saves, and clears draft values and expansion/treatment flags without creating views or committing canonical business records. The overlay remains responsible for applying the restored draft to widgets; canonical trip-form submission remains unchanged.
- Instrumentation checks the draft save/load/clear boundary alongside the existing WebView-disabled full-shift acceptance, including preservation of entered amounts, cancellation reason, synchronization state, and treatment/expansion flags.
