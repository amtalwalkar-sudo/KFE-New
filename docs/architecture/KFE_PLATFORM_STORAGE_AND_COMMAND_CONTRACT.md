# KFE Platform Storage and Command Architecture Contract

**Status:** Proposed architecture contract for review; implementation has not started.  
**Scope:** Browser PWA, Capacitor-hosted Android PWA, native Android overlay, native GPS service, and the local Work workflow.  
**Current branch context:** Native overlay background transition work and the timer/GPS source audit.

## 1. Product contract

KFE is one application with multiple interfaces—not separate PWA and overlay workflows.

The browser PWA and Android surfaces must implement the same business rules and command semantics. On Android, the PWA and native overlay must use the same authoritative local Work records and outcomes. The overlay must complete a shift workflow without requiring the PWA/WebView to be open.

**Cross-device synchronization is explicitly out of scope for this phase.** No Firebase integration, cloud synchronization, or cross-device consistency is required for acceptance now. Firebase may be evaluated later as a separate requirement; this contract neither implements nor promises it.

## 2. Responsibilities and boundaries

### Shared application/domain contract

Define platform-neutral commands, validation rules, state transitions, result shapes, and read/query semantics for Work operations. The contract must cover at least shift lifecycle, pickup/dead movement, trip start/end, fare, cancellation, fuel, and GPS trace association. Keep business rules out of interface-specific event handlers.

### Browser PWA adapter

The ordinary browser PWA continues to use the existing IndexedDB persistence adapter. It must invoke the same application/domain contract and preserve current domain, validation, audit, and financial semantics. Browser operation must not require native Android APIs.

### Android persistence adapter

On Android, canonical Work records and command outcomes must be durably owned by one native-backed persistence boundary accessible through a Capacitor bridge by the Android PWA and directly by native Android components such as the overlay and GPS service. Do not dual-write authoritative records to native storage and IndexedDB as two independent authorities.

The Android PWA may keep a cache/read model for rendering, but it must not become a second authority. It must be refreshable from canonical native state and must not need to replay queued UI events to create canonical business records.

### Native overlay

The overlay is a control surface, not a second business engine or trip database. It submits commands, renders committed state, and shows explicit pending/rejected outcomes. Local gesture state and form drafts may be retained for recovery, but must not be mistaken for committed business state.

### Native GPS service

Android native code owns the lifecycle of background GPS collection on Android. Canonical Work transitions must start, switch, and stop collection without depending on JavaScript event replay. Raw trace evidence must survive interruptions and be associated with the correct shift/trip and event type. Trace import into canonical location records must be idempotent and verified before raw evidence is deleted.

## 3. Durable command and persistence contract

Each mutating command must carry a stable operation ID, command type, target entity/shift/trip, validated payload, and timestamp/context sufficient for audit.

The canonical boundary must:
1. Validate the requested transition against the current canonical state.
2. Atomically commit the business mutation and its durable operation outcome/audit information.
3. Return an explicit accepted or rejected result, including the resulting canonical state/version or stable error.
4. Return the prior outcome when the same operation ID is retried; never duplicate trips, fare/revenue, cancellation, fuel, audit effects, or GPS associations.
5. Preserve pending operations and raw evidence across process death, offline use, and restart.
6. Ensure a UI cannot display a transition as committed before the authoritative boundary accepts it.

If an operation cannot be committed, the caller must receive a recoverable failure and the UI must not falsely advance. Event delivery/acknowledgement may remain as a transport detail, but it is not the canonical business record.

## 4. Timer and GPS rules

- Commit trip start/end and shift start/end timestamps with canonical transitions.
- Derive elapsed time from persisted timestamps, not from incrementing counters or a foreground JavaScript interval.
- Native overlay timer refresh must not depend on WebView visibility or polling.
- A stale PWA snapshot must never overwrite a newer canonical timestamp or workflow state.
- Distinguish pickup/dead movement distance from passenger/business trip distance; render the distance matching the active GPS event type.
- Expose GPS status separately from distance: waiting for a fix, permission denied, provider disabled, stale fix, collecting, or failed. Zero distance must not conceal a collection failure.
- GPS trace evidence, cumulative distance, owner ID, event type, last-fix timestamp, and accuracy must be recoverable and consistently queryable.

## 5. Migration and compatibility

Before Android switches to the native-backed canonical store, inventory and migrate existing IndexedDB data idempotently. At minimum assess shifts, trips, fare/cancellation details, fuel entries, location snapshots/traces, pending mutations, and audit history. Re-running migration must not duplicate records or lose provenance. Define conflict handling for an active shift/trip rather than silently choosing a winner.

The browser IndexedDB adapter remains supported. Use contract tests against both adapters wherever practical so platform-specific persistence does not change business behavior.

## 6. Acceptance gates

- Complete multiple trips in one shift from the overlay with the PWA/WebView closed.
- Save fare, cancellation, and fuel entries through the same canonical command boundary.
- Reopen the PWA and observe the exact same committed shift/trip/form outcomes without event replay being required to create them.
- Retry identical operation IDs and prove no duplicate business or audit effects.
- Interrupt operations and restart the app/service; verify deterministic recovery.
- Verify timer continuity in foreground, background, screen-off, and process restart.
- Verify native GPS starts at pickup, switches to passenger trace at trip start, stops at the appropriate transition, and reports meaningful status/distance.
- Run automated contract/regression tests, CI, and APK artifact validation before merge.
- Physical-device tests remain required for Android permission, screen-off, background, restart, and OEM battery behavior.

## 7. Non-goals and implementation guardrails

- No cross-device sync or Firebase implementation in this phase.
- No second authoritative native trip history alongside PWA IndexedDB on Android.
- No dependence on opening the Work view to finish or persist overlay actions.
- No more gesture-only or queue-retry-only patches presented as completion of this architecture requirement.
- Do not change unrelated financial or admin behavior while introducing the Work persistence boundary.
