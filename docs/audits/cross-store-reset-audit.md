# Cross-store Reset Data audit

Status: implementation is in the dedicated draft PR #373. The reset protocol is not considered merge-ready until the current contract suite, production build, Android instrumentation/exact-APK, governance, and UI-isolation gates pass.

## Audited persistence surfaces

- Browser canonical IndexedDB contains business stores, the settings store, form drafts, pending mutations, and a canonical operation ledger. The export backup's 21 stores do not include every internal operational store, so reset verification must check the internal ledger and drafts separately.
- Rolling local recovery snapshots live in a separate IndexedDB database, `kanishka_kfe_local_backup_db`. A reset-specific checkpoint is stored under its reset ID so it does not overwrite the rolling backup or an earlier checkpoint.
- Native SQLite `KfeCanonicalWorkStore` owns canonical records, operation outcomes, audit rows, migration state/items, and create intents. Clearing only records would leave retry paths able to resurrect old data.
- Native lifecycle events are stored in a separate SQLite database (`KfeNativeEventStore`) and mirrored into SharedPreferences for a compatibility handoff. They are an additional replay path and must be invalidated/blocked during reset, not ignored because they are transport state.
- Startup normally recovers stale pending mutations. Reset recovery now runs before that replay step.
- Persistent app settings are stored in IndexedDB's `settings` store; session-scoped data-source selection and synthetic date context are maintained in sessionStorage.

## Required invariants and current implementation

1. **Active shift protection:** check the browser snapshot and authoritative native SQLite SHIFT records before clearing. The reset must be aborted if either side reports an ACTIVE shift.
2. **Verified checkpoint:** enable the canonical write barrier, write a reset journal in the separate backup database, create a reset-ID-scoped backup checkpoint, and verify its timestamp/counts before native reset begins.
3. **Durable cross-store state:** browser reset journal and native `canonical_reset_state` use the same reset ID and resumable phases. Native state is retained across process death.
4. **Mutation barrier:** canonical IndexedDB read-write transactions are intercepted while a reset marker exists. Native canonical write methods check SQLite reset state and their JS bridge checks the browser barrier. Native lifecycle event appends/replay are blocked by a durable SharedPreferences reset barrier.
5. **No stale replay:** clear browser pending mutations and canonical operation ledger; cancel native create intents; invalidate pending native lifecycle events and clear both current and legacy SharedPreferences handoffs before native records are cleared.
6. **Factory defaults:** clear business/settings stores, drafts, and internal browser canonical operations; reset the session data source to canonical defaults. The separate reset journal and reset-specific recovery checkpoint are preserved.
7. **Idempotent recovery:** each clear phase can be repeated with the same reset ID. Startup resumes pending reset before mutation replay; uncertain state or missing/changed checkpoint fails closed.
8. **Verified success:** browser exportable stores and internal canonical stores are checked empty; native reset completion is verified before the journal is marked complete and barriers are released.

## Implementation and validation still required

- Run and review the complete `npm test` contract suite and production PWA build on the latest PR commit.
- Run/review native Android instrumentation and the exact-APK gate, including process-death/retry phases and native event cancellation.
- Review UI-isolation and governance results and fix every failure before marking the draft PR ready.
- Physical-phone verification remains a post-merge gate: with network disabled, verify reset/checkpoint behavior and that no old trip, shift, fare, pending mutation, create intent, or native lifecycle event reappears after reload/restart.

Do not reuse the closed browser-only PR #371 as an implementation base.
