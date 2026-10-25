# Cross-store Reset Data audit (initial)

Status: audit in progress; no reset implementation is considered safe or complete yet.

## Confirmed current behavior

- `src/repositories/backupRepository.js` implements `resetCanonicalData()` by opening IndexedDB and clearing selected browser stores in one IndexedDB transaction.
- That method excludes the `settings` store and includes `form_drafts`; this conflicts with the requested factory-default settings behavior.
- The reset method does not create and verify a pre-reset checkpoint before clearing.
- `src/application/backup/backupService.js` exposes `resetData()` as a thin wrapper around this browser-only operation.
- `android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkPlugin.java` has no reset/recovery protocol methods in the current main version.
- `KfeCanonicalWorkStore.java` owns SQLite canonical records plus durable operation, audit, migration, and create-intent tables. Reset must account for these tables and prevent stale create intents/retries from recreating cleared records.
- `src/application/startup/startupService.js` runs storage initialization and pending-mutation recovery before normal startup completes. An unfinished reset must be resolved before reconciliation or mutation recovery can replay stale work.
- Local recovery snapshots live in a separate IndexedDB database (`kanishka_kfe_local_backup_db`), so they can be retained independently of canonical-store clearing; checkpoint creation and verification must finish before destructive steps.

## Required invariants

1. Never start reset while a native SQLite SHIFT is ACTIVE; browser-only state is insufficient.
2. A verified recoverable checkpoint must exist before any destructive operation.
3. A durable reset ID/state must be idempotent and discoverable after process death.
4. A pending reset blocks canonical mutations, create-intent completion/replay, startup reconciliation, and pending-mutation replay until recovery finishes.
5. Both native SQLite and browser IndexedDB must reach the intended reset state before success is acknowledged.
6. Business stores and user settings are reset to factory defaults; reset metadata and recovery facilities remain durable; exported/local recovery backups remain available.
7. On ambiguous state or failed verification, fail closed and preserve recovery data rather than report success.

## Implementation and validation plan

- Finish inventory of settings keys/defaults, IndexedDB stores, native record types and replay paths.
- Add a native SQLite reset journal and transactional active-shift guard; define durable phase transitions and idempotent recovery.
- Add a browser reset barrier and startup gate that recovers an unfinished reset before mutation/reconciliation.
- Coordinate native/browser phases through the native plugin/runtime adapter; verify both stores after clearing.
- Add contract and Android instrumentation coverage for active-shift blocking, retries/process-death at each phase, stale create intents/outbox replay, factory settings, and retained recovery.
- Run full contract suite, production build, Android exact-APK and required governance/UI gates. Physical offline-phone verification remains the final post-merge gate.

Do not reuse the closed browser-only PR #371 as an implementation base. Start from current main.
