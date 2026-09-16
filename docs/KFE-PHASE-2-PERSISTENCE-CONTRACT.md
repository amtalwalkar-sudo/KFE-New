# KFE Phase 2 — Data Persistence / Local-First Contract

**Phase:** 2 — Data Persistence / Local-First  
**Status:** Working contract  
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
