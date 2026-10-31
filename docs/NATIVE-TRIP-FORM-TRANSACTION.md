# Native Trip Form Transaction

**Status:** SUPPORTING IMPLEMENTATION EVIDENCE — native fare/cancellation transaction boundary. The original PR #323 verification is historical; current code and acceptance must be judged against PR #412, the current architecture contract, and `KFE_ANDROID_RELEASE_GATE.md`. This document does not establish physical-device acceptance.

## Decision

KFE does not need a headless JavaScript runtime merely to persist ordinary native-overlay fare and cancellation submissions. The overlay submits a bounded command to the existing canonical Android SQLite store. SQLite transactions provide atomicity; native code enforces minimum invariants needed to keep durable records and the financial projection consistent. The PWA owns shift start/end, shared Work orchestration, and read-only reporting views. Native Android owns the durable overlay transaction and its persistence-critical validation.

This is the pragmatic split between **simple accumulation** and **complex business rules**. It is not permission for the PWA to repair an accepted fare later: ordinary accepted commands must already be financially correct when committed.

## Financial authority (explicit decision)

**Option A is the authority for KFE:** `Shift.revenue` is derived from eligible completed-trip fares plus cancellation fees. Completed trips with `fareDetailsSkipped=true` contribute ₹0. Blank or not-applicable cancellation fees are normalized to ₹0; valid non-negative cancellation fees are included once. This rule applies to the canonical SQLite transaction, PWA projections/reporting, native overlay, and tests. Reopening the PWA is not a repair step for an accepted native submission.

## Implemented on main

- `KfeCanonicalWorkStore.commitTripForm(operationId, mode, trip)` commits the trip form, derived `Shift.revenue` / `liveFareRevenue`, durable operation outcome and audit row in one SQLite transaction.
- It rejects missing identity, unsupported mode, wrong terminal trip state, invalid/negative amounts, stale/conflicting trip versions, mismatched shift identity and an inactive canonical shift.
- `Shift.revenue` is recalculated through the same `refreshShiftRevenueProjection` helper used by ordinary native Trip writes. There is one native persistence-projection implementation: eligible completed-trip fares plus cancellation fees. Skipped fare details do not contribute; a blank/not-applicable cancellation fee is normalized to ₹0.
- The JavaScript domain rule remains the semantic authority; the native helper is only the atomic SQLite persistence mirror and is checked for parity by `nativeCanonicalPersistence.contract.js`. Native GO_TO_PICKUP, START_RIDE and END_RIDE use `commitTripLifecycle`, which validates the expected prior Trip stage, stable Shift identity, active Shift state and expected Trip version inside the same SQLite transaction as the canonical write.
- Repeated use of the same operation ID and identical payload returns the durable prior result without applying the command again. Reuse with a different command/payload is rejected.
- `KfeOverlayService.persistCanonicalTripForm` now calls this single transaction instead of committing the trip and revenue projection in separate transactions. Trip fare remains supporting detail (`revenueAuthority: SUPPORTING_ONLY`); `Shift.revenue` remains the sole canonical shift-level projection.
- Native form amount and cancellation-reason validation is implemented in the Android-independent `KfeNativeTripFormRules` helper and mirrors the PWA domain constraints; canonical store validation remains the final persistence boundary. The shared revenue parity vector is covered by the JS domain contract and Android instrumentation. Native form commits are allowlisted: fare forms may change only fare/toll/parking/skipped-fare facts and update time; cancellation forms may change only terminal status, cancellation reason/fee, cancellation event time and update time. Shift identity, Trip stage, start/completion timestamps and unrelated Trip fields are immutable to these forms.
- Blank optional amounts remain valid; negative, malformed, and non-finite amounts are rejected before command creation, and the canonical SQLite transaction independently enforces persistence-critical amount invariants.
- Android instrumentation exercises atomic fare projection and idempotent retry. Full-shift acceptance exercises multiple fares, cancellation fees, blank cancellation fees, replay and store reopen; the release gate also verifies native-only operation with WebView unavailable.

## Deliberate limits and acceptance gates

- The native command enforces persistence-critical invariants, not every rich PWA rule. Any rule essential to deciding whether a native submission is valid must be represented in the command contract or the operation must wait for the PWA.
- This change does not establish that all PWA forms or shift start/end can run without the WebView; shift start/end remain PWA-owned.
- The durable native outbox/checkpoint recovery remains in place. A queued transport event is not itself proof of a canonical commit.
- The canonical database remains `kfe_canonical_work.db`; no second SQLite store is introduced.
- Regression protection must continue to run Android instrumentation for fare/cancellation submission with WebView unavailable, retry after commit/lost acknowledgement, PWA catch-up, and process-death recovery. GPS acceptance is governed separately by docs/ANDROID-NATIVE-GPS-CONTRACT.md and is limited to one-shot trip-boundary snapshots; continuous screen-off trace collection and restart trace recovery are not part of the active GPS scope.

## Native form command construction boundary

- The native overlay reads current widget/draft values and invokes `KfeNativeTripFormRules` to build the bounded fare or cancellation payload. The helper owns trimming/null normalization and optional amount validation; it does not access Android views or commit data.
- `KfeOverlayService` remains responsible for active-shift verification, durable event identity/queueing, canonical SQLite commit, and reporting the outcome. Payload construction extraction must not move or split that transaction.
- The WebView-disabled native trip-form instrumentation checks payload values and treatment mapping through the native submission workflow; it does not move shift start/end ownership to Android.
- Native form draft serialization now lives in `KfeNativeTripFormDraftStore`: it loads, saves, and clears draft values and expansion/treatment flags without creating views or committing canonical business records. The overlay remains responsible for applying the restored draft to widgets; canonical trip-form submission remains unchanged.
- Instrumentation checks the draft save/load/clear boundary alongside the existing WebView-disabled full-shift acceptance, including preservation of entered amounts, cancellation reason, synchronization state, and treatment/expansion flags.
