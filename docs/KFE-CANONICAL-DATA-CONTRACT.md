# KFE Canonical Data Contract

**Phase:** Canonical Domain & Data Model / ERP input audit  
**Status:** AUTHORITATIVE  
**Calendar timezone:** `Asia/Kolkata` (IST)  
**Scope:** Canonical persisted/application data boundary for the single-vehicle KFE ERP

## 1. Contract purpose

This document defines the canonical data contract that implementation, repositories, domain calculations, tests, and future backup/sync layers must preserve.

The contract is provider-independent. Storage, OCR/AI provider, backup provider, cloud provider, and sync provider must not redefine canonical business meaning.

```text
External / UI / OCR / import / legacy shape
                  ↓
             NORMALIZATION
                  ↓
          CANONICAL ENTITY
                  ↓
             REPOSITORY / COMMAND CONTRACT
                  ↓
        RUNTIME DURABLE COMMIT STORE
          ├─ Browser/PWA: IndexedDB
          └─ Native Android: SQLite
                  ↓
     mutation + audit + notification
                  ↓
     idempotent cross-runtime convergence
```

Compatibility aliases belong only at normalization boundaries. Canonical domain logic uses canonical names and semantics.

## 1.1 One logical authority across platform stores

KFE has one canonical business/data model and one logical operational state. It does not have one physical database shared by the browser and native Android runtimes.

- Browser-only commands commit through the IndexedDB-backed repository path.
- On Android, Work and native overlay commands commit durably to native SQLite first; the PWA's IndexedDB representation is synchronized/reconciled as a projection when the WebView is active.
- The runtime-specific durable commit is the authority for that command. A UI, queue enqueue, or projection update alone is not proof of commit.
- Stable record and operation identities, idempotent replay, stale-write rejection, and canonical reconstruction are required for convergence.
- The stores are platform persistence adapters/projections of the same logical model; neither may define separate business rules or independently invent a competing business outcome.
- This is a replicated cross-runtime boundary, not zero coupling. Its convergence and recovery behavior must be tested at the repository, emulator, and physical-device proof levels as applicable.


## 2. Identity and time

Every canonical entity has a client-generated UUID `id`. Existing IDs are preserved during updates and remain stable across backup/restore, migration, and future sync.

True instants (`createdAt`, `updatedAt`, `shiftStartAt`, `shiftEndAt`, `tripStartAt`, `tripEndAt`, `capturedAt`) are persisted as unambiguous timestamps and interpreted in IST for business display/grouping.

Business calendar dates (`effectiveFrom`, `validUntil`, `performedOn`) are IST dates. They must not be compared by passing UTC-midnight conversions through timestamp arithmetic.

## 3. Provenance and authority

Provenance records where a value came from: manual, OCR/multimodal, imported/restored, synthetic/test, or system-derived as applicable.

Authority is separate from provenance. A value being manually entered or OCR-derived does not by itself make it authoritative. Calculation authority is defined explicitly below.

## 4. Validation and normalization

Canonical entities must pass required-field, relationship, numeric, status, temporal, effective-date, and domain-invariant validation before business calculations consume them.

Normalization is the only compatibility boundary. It converts representations to canonical types and must not change business meaning, authority, period, unit, sign, or provenance.

## 5. Canonical entities

### Vehicle and Driver

Vehicle and Driver are authoritative Admin master records. Preserve their identity and historical references when records are soft-deleted.

### Shift

Shift is the authoritative operational boundary for shift lifecycle and start/end odometer observations. Shift start/end remain PWA-owned.

`Shift.revenue` is the canonical projection of saved fares on completed Trips plus saved cancellation fees. A missing cancellation fee contributes zero. Shift revenue is not manually entered at shift end.

### Trip / Ride

Trip records represent the ride workflow and remain linked to a Shift through `shiftId`. Completed and cancelled outcomes remain distinct. Cancellation is a retained status, not deletion. Saved fare and cancellation-fee facts remain distinct.

Ride-distance fields may remain in historical records for compatibility, but the current Timeline and Performance screens must not derive or display ride-distance metrics.

### Fuel / Refuelling

`fuel_logs` are authoritative recorded fuel-spending inputs. Partial refills remain saved and contribute to recorded spending. Fuel cost/km is derived only from consecutive valid full-tank odometer readings.

### Maintenance and Compliance

Maintenance and Compliance records are authoritative Admin-entered source facts. The current product may display and edit their saved form data, but it does not calculate maintenance provisions, compliance provisions, break-even, targets, or profitability from them.

### Loan and historical finance records

Loan terms, loan payments, prepayments, settlements, driver targets, and break-even-input records may exist in historical databases and backups. Preserve those records during scope cleanup and backup/restore. They are not a license to expose retired workflows or run amortization, target, break-even, provision, or profitability calculations. The active Admin UI exposes only the basic Loan source form.

### GPS event snapshots

GPS event snapshots are supporting evidence attached to the four ride event moments: `PICKUP_START`, `TRIP_CANCELLED`, `TRIP_START`, and `TRIP_END`. Keep `capturedAt` and `eventAt` separate. A GPS snapshot must not mutate the ride or shift record. A cancellation snapshot is not a drop-off.

### Audit / Mutation

Canonical writes that support mutation/audit coupling write the canonical record, pending mutation, and audit history transactionally. Mutation/audit records have their own UUIDs and retain the affected canonical `entityId`.

## 6. In-scope derived values

| Value | Saved source | Rule |
|---|---|---|
| Recorded revenue | Saved Shift/Trip facts | Completed ride fares plus saved cancellation fees; missing fees are zero |
| Completed ride count | Saved Trip records | Count completed rides in the selected period |
| Fuel spending | Saved fuel logs | Sum recorded refill amounts in the selected period, including partial refills |
| Fuel cost/km | Saved full-tank fuel observations | Consecutive valid full-tank odometer readings only |
| Income after fuel | Recorded revenue and fuel logs | Recorded revenue minus recorded fuel spending |

No other derived financial values are in scope. UI and presentation must not reproduce formulas or create a competing source of truth.

## 7. Lifecycle and deletion

Operational lifecycle and administrative deletion are separate dimensions.

```text
OPERATIONAL STATE
ACTIVE / COMPLETED / CANCELLED / ...

ADMINISTRATIVE LIFECYCLE
ACTIVE / SOFT-DELETED
```

- Vehicle, Driver, Compliance, Maintenance, and Loan source records use the existing governed Admin lifecycle.
- Historical payment, prepayment, target, and break-even-input records must be preserved during scope cleanup, even though their retired workflows are no longer exposed.
- Shift, Trip, Fuel, and GPS event evidence remain retained as canonical business/operational history.
- Hard deletion of canonical business records requires an explicit data-destruction action; removing an obsolete feature must not delete its saved records.

## 8. Relationships and mutation boundary

Validate existing canonical relationships at the repository boundary, including Trip → Shift, Compliance/Maintenance → Vehicle, Driver → Shift/Trip where recorded, and legacy payment/prepayment → their source records.

Canonical persistence and read models must be accessed through the application/repository boundary. Presentation screens must not become a second persistence authority.

## 9. Input and derivation rule

Users enter source facts through the Work or Admin forms. Only the explicitly supported values listed in Section 6 are derived for Performance. Missing or invalid inputs must not be fabricated. Historical fields and records can be preserved without activating their former calculation models.

## 10. Timeline and location evidence boundary

Timeline is a read-only projection of saved ride and fuel records. It must not create or alter business facts.

- Locality resolution is manual-only through the user's Timeline pull-to-refresh while online.
- No automatic locality retry, polling, background connectivity check, or queued resolution job is permitted.
- A reliable resolved locality may be shown; otherwise show `Location unavailable`. Do not show raw coordinates as a locality or retain a stale label after a failed manual refresh.
- Location evidence keeps the provider capture timestamp (`capturedAt`) distinct from the ride event timestamp (`eventAt`).
- A cancellation location is cancellation evidence, not a drop-off location.

## 11. Authority boundary

This document is the sole canonical data-model authority. Phase persistence/operational-record contracts, frozen requirements, audits, recovery gates, and implementation notes may explain or verify this model but may not redefine an entity, source-of-truth field, relationship, or data authority.

If a data rule is discovered in a supporting document, it must be migrated here (or to the business-rule/calculation authority when its responsibility is semantic/formula ownership) before the supporting document is treated as current.

## 12. Removed legacy/supporting store

`driver_collected_data` is not part of the current canonical model. The former store was supporting-only and did not own an independent calculation authority; its operational fields duplicated facts already owned by Shift/Work or had no authoritative ERP calculation role.

The canonical database migration from version 9 to version 10 explicitly removes the obsolete store. New backups no longer contain it. Backup format version 3 remains backward-compatible with legacy format versions 1 and 2 by accepting and discarding the removed `driver_collected_data` payload during validation/upgrade before restore.

There is intentionally no replacement Admin entry for generic driver-collected data. Operational facts have one natural entry point and one authority.
