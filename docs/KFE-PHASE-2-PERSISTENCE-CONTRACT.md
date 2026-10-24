# KFE Phase 2 — Data Persistence / Local-First Contract

**Phase:** 2 — Data Persistence / Local-First  
**Status:** SUPPORTING IMPLEMENTATION CONTRACT — subordinate to docs/KFE-CANONICAL-DATA-CONTRACT.md and docs/KFE-ARCHITECTURE-CONTRACT.md  
**Calendar timezone:** `Asia/Kolkata` (IST)

## 1. Purpose

Phase 2 realizes the frozen Phase 1 canonical contract as durable, provider-independent local persistence. KFE must remain usable and retain its canonical dataset on-device without cloud availability.

Cloud backup and multi-device synchronization are later phases and must not become dependencies of local persistence.

## 2. Local-first invariant

```text
canonical domain
      ↓
repository boundary
      ↓
IndexedDB canonical stores
      ↓
local KFE dataset
```

A cloud service must not be required to create, read, update, calculate, or retain canonical operational data in Phase 2.

## 3. Canonical persistence

Every canonical persisted entity uses its stable client-generated UUID as the IndexedDB key path `id`. Existing IDs survive updates and future migration/backup/sync operations.

Canonical stores remain those established by Phase 1. Supporting stores remain infrastructure/supporting records and cannot become replacement business authorities.

## 4. Repository boundary

Repositories own persistence operations for their canonical domains. Repository writes must:

- normalize input before persistence;
- preserve canonical IDs and timestamps;
- validate required relationships and domain invariants;
- use IndexedDB transactions for coupled canonical/mutation/audit writes;
- resolve only after transaction completion;
- publish canonical-data-changed notification after successful commit;
- never silently fall back to an unrelated persistence authority.

## 5. Transaction contract

A mutation that changes canonical data and its mutation/audit lineage must commit atomically where those records are coupled. A failed transaction must not be reported as successful.

Transaction lifecycle errors (`error`/`abort`) must reject the operation.

## 6. Mutation and audit persistence

Mutation records are durable local queue records with their own UUID, affected `entityId`, action, payload, status, retry count, version, and creation time. Audit records have their own UUID and retain the mutation relationship.

Pending mutation ordering is deterministic by creation time and UUID. Sync processing is not part of Phase 2, but the persistence shape must remain compatible with the later sync phase.

## 7. Soft deletion

Administrative deletion of entities governed by Phase 1 is persisted as soft deletion (`deleted` / `deletedAt`) and retains identity and lineage. Normal active queries exclude administratively deleted records.

Operational Shift/Trip/Fuel records do not gain incidental hard-delete paths in Phase 2.

## 8. Schema and migration contract

IndexedDB schema changes are versioned. Upgrade handlers must be idempotent for stores and indexes that already exist, create missing structures required by the current schema, and remove only explicitly retired legacy stores under a deliberate migration rule.

Existing canonical data must not be silently discarded during a schema upgrade. Schema evolution must preserve stable IDs and canonical meaning.

## 9. Index contract

Indexes are persistence/query infrastructure only. They may accelerate retrieval but must not define or duplicate business authority.

Required indexes include the established operational and mutation indexes for shift end time, fuel capture time, trip shift/status/start time, administrative relationships/effective dates, and pending-mutation creation/status.

## 10. Initialization and lifecycle

Storage initialization is idempotent. Concurrent initialization requests share the initialization operation. A database version change closes the stale connection so a later operation can reopen the current schema.

Persistence failure must remain observable; no silent in-memory-only success path is permitted for canonical writes.

## 11. Provider boundary

Phase 2 persistence must not import or require Supabase, Firebase, Google Drive, OCR/AI providers, or other external providers. Provider selection remains replaceable at later integration boundaries.

## 12. Phase 2 exit condition

Phase 2 is complete when the canonical dataset can be created, read, updated, soft-deleted where governed, transactionally recorded with mutation/audit lineage, migrated across the supported local schema, and retained entirely on-device without cloud availability, with persistence contracts and regression coverage passing.

## 13. Cross-surface canonical persistence acceptance

The PWA and native Android overlay are two interfaces to one single-user, single-device KFE application. They must not create competing business records or require a cloud service to converge.

The required end-to-end acceptance scenario is:

1. Start with the PWA closed and the device offline (including airplane mode).
2. Open/use the native overlay and complete a trip operation, including fare entry.
3. Confirm the operation is acknowledged only after its authoritative local commit.
4. Reopen the PWA while still offline.
5. Verify the same canonical trip ID, completion state, fare/skipped-fare state, shift linkage, and derived revenue are visible, with no duplicate trip or financial outcome.

Repeat in the opposite direction: a PWA mutation must be visible to the overlay. Test process death/restart and retry as well as the happy path.

A native SQLite store and browser IndexedDB store are not one physical database and do not provide a cross-store atomic transaction merely because records are mirrored. Until a verified cutover provides one atomic authority, any staging/write-through design must explicitly preserve the source record, persist a retryable operation marker, require native acknowledgement where applicable, reject stale/conflicting writes, and reconcile before presenting a recovered snapshot as authoritative. The existing native persistence tracker records this as guarded write-through, not a completed cross-database atomic cutover. Passing source contracts or CI alone does not satisfy the physical-device acceptance scenario.

## 14. Canonical storage unavailable or untrustworthy

- If canonical storage cannot be opened/read or its integrity cannot be established, do not silently initialize an empty competing business dataset and do not report canonical writes as saved.
- Attempt safe reconnection/recovery and preserve the original data/source before considering any migration or repair.
- If the canonical store is damaged or untrustworthy, block writes to that store until integrity is restored.
- Do not introduce a separate emergency recovery journal by default. It may be considered only after a concrete failure mode is demonstrated and only if its writes are independently durable and its reconciliation into canonical records is deterministic, identity-preserving, idempotent, and tested. It must never become a second permanent business-data authority.
- Emergency capture is permitted only where durable persistence and safe later reconciliation can be demonstrated. Otherwise, clearly tell the driver that the record has not been saved and preserve recoverable input where possible.

## 15. Offline export and loss-protecting restore

Export must work without internet and produce a complete, versioned, validated backup of the canonical dataset and its required relationships. The user must be able to save the export to a separately managed location outside KFE's app data, so it can survive app-data loss or reinstall.

Restore is **loss-protecting reconciliation, not blind replacement**:

1. Validate the entire backup (format/version, allowed stores, record keys, record shape, and supported relationships) before mutating canonical data.
2. Preserve all current records that remain recoverable, including records newer than the backup. A restore must not erase a ride, fare, shift, or expense recorded after the backup was made.
3. Reconcile backup and current records using stable canonical IDs and explicit entity relationships. Preserve trip-to-fare and trip-to-shift identity; do not create duplicate operational or financial outcomes.
4. Add recoverable historical records that are missing locally. Identical records with the same ID are deduplicated. Same-ID records with materially different payloads must follow an explicit conflict policy; do not silently overwrite newer/current data or guess which version is correct.
5. Preserve unresolved durable operation/recovery markers until their outcomes have been verified and reconciled.
6. Apply the reconciled result transactionally where supported. If the platform cannot safely apply the complete result atomically, use a staged/checkpointed recovery plan with a verified rollback/recovery path; never expose a half-restored dataset as complete.
7. Re-read and verify the resulting canonical records and relationships before reporting success. On failure or interruption, retain the original recoverable state and enough evidence to resume safely.

The earlier Phase 7 clear-and-repopulate test proves only that the former replacement operation was transactional. It does not prove compliance with this loss-protecting reconciliation requirement. The exact policy for materially conflicting same-ID payloads must be specified and tested before implementation is accepted; unresolved conflicts must be surfaced rather than silently discarded.

## 16. Factory-default reset safety

“Reset Data” means return KFE to factory defaults, not merely delete selected operational rows or silently drop/recreate the database.

- Reset clears canonical business records and returns user-configurable settings/preferences to their defined defaults. It preserves the schema/version and initialization machinery needed to start safely.
- Before reset, create and verify a recoverable checkpoint when the current data can be read safely. An exported backup outside app control must not be modified or deleted by reset.
- Block reset while a shift is active. The driver must use the normal authoritative end-shift workflow first; the overlay must not implement an independent shift-end path. Confirm that shift closure committed before allowing reset.
- If shift closure or reset has an uncertain outcome, verify/reconcile the canonical state before retrying or proceeding. Do not erase the only recoverable copy when a checkpoint cannot be safely created.
- The reset must target only the defined canonical stores and governed settings, use transactional clearing where supported, and report success only after the reset commits and the resulting factory-default state is verified.
- Keep any recovery material needed to recover from an accidental reset until the recovery policy safely permits its removal.

## 17. Acceptance status and scope discipline

These requirements define expected behavior; they do not claim the current implementation already satisfies it. Each must be mapped to existing contracts/tests and classified as covered, partial, missing, or contradicted before code changes. Add tests for genuine gaps rather than duplicating existing coverage. Android overlay/PWA persistence changes additionally require the exact-APK Android release gate and physical-device verification; mark the device result NOT DEVICE-VERIFIED when that check has not been run.

The question of whether a shift may close with required fare work still pending is not changed by this supplement. The existing lifecycle rule remains: missing **optional** fare detail alone does not block the next pickup or shift closure; any distinction between optional/skipped fare and genuinely required unresolved work must follow the business rules and be decided explicitly, not inferred by the persistence layer.


### Critical acceptance gate — same offline source of truth

This is the primary product requirement and a release blocker, not a secondary persistence enhancement.

The intended user-visible behavior is one KFE dataset shared by the native Android overlay and the PWA, with either interface able to read and mutate it offline. In particular, with the PWA/WebView closed and airplane mode enabled, the overlay must durably save a trip/fare; reopening the PWA offline must show that exact trip and fare with the same IDs and derived totals. PWA-originated changes must likewise become visible to the overlay. This must survive process death/restart and retries.

**Current audited status: PARTIAL — NOT YET ACCEPTED.** The native persistence tracker explicitly says Android SQLite is authoritative for acknowledged Android lifecycle/fare records, while Android-hosted PWA IndexedDB remains a staging/read cache. WorkService performs guarded write-through and recovery with a durable pending marker and native acknowledgement; this is not a single physical database or a cross-store atomic transaction. The native boundary and overlay write path exist, and CI/instrumentation coverage is reported, but the tracker explicitly says the migration/cutover is not complete and physical-device acceptance remains pending.

Do not describe this as “same database” or “fully synchronized” until the architecture/code audit establishes one of these verified designs:
- both interfaces directly use the same native-backed canonical repository for all relevant business reads and writes; or
- a deliberately retained multi-store design has a formally specified, durable, deterministic synchronization protocol that meets every acceptance scenario above and is verified under offline, process-death, retry, stale-write, and conflicting-write conditions.

A mirror, cached snapshot, or passing unit/CI contract by itself is insufficient. Keep this gate open until the PWA-closed overlay-write → PWA-reopen-offline read scenario and the reverse direction pass on the target Android device with duplicate/lost-update checks.
