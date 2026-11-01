# KFE Canonical Data Contract

**Status:** AUTHORITATIVE  
**Calendar timezone:** `Asia/Kolkata` (IST)  
**Scope:** Canonical persisted/application data boundary for the single-vehicle KFE ERP

## 1. Contract purpose

This document defines the canonical data contract that implementation, repositories, domain calculations, tests, and future backup/sync layers must preserve.

The contract is provider-independent. Storage, backup provider, cloud provider, and cross-runtime synchronization must not redefine canonical business meaning.

```text
External / UI / imported or legacy shape
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

Provenance records where a value came from: manual, imported/restored, synthetic/test, or system-derived as applicable.

Authority is separate from provenance. A value's source does not by itself make it authoritative. Calculation authority is defined explicitly below.

## 4. Validation and normalization

Canonical entities must pass required-field, relationship, numeric, status, temporal, effective-date, and domain-invariant validation before business calculations consume them.

Normalization is the only compatibility boundary. It converts representations to canonical types and must not change business meaning, authority, period, unit, sign, or provenance.

## 5. Canonical entities

### Vehicle and Driver

Vehicle and Driver are authoritative Admin master records. Preserve their identity and historical references when records are soft-deleted.

### Shift

Shift is the authoritative operational boundary for shift lifecycle and start/end odometer observations. Shift start/end remain PWA-owned.

`Shift.revenue` is the canonical projection of saved fares on completed Trips plus saved cancellation fees. A missing cancellation fee contributes zero. Shift revenue is not manually entered at shift end. The domain rule is the semantic authority; Android SQLite mirrors that exact rule transactionally as a persistence invariant for native overlay commits made while the WebView is unavailable. That mirror must use one native helper and remain covered by cross-runtime parity tests; it cannot add or alter business rules.

### Trip / Ride

Trip records represent the ride workflow and remain linked to a Shift through `shiftId`. Completed and cancelled outcomes remain distinct. Cancellation is a retained status, not deletion. Saved fare and cancellation-fee facts remain distinct. Trip.revenue is supporting detail for the canonical Shift.revenue projection, not an independent shift-level revenue authority.

Ride-distance fields may remain in historical records for compatibility, but the current Timeline and Performance screens must not derive or display ride-distance metrics.

### Fuel / Refuelling

`fuel_logs` are authoritative recorded fuel-spending inputs. Partial refills remain saved and contribute to recorded spending. Fuel cost/km is derived only from consecutive valid full-tank odometer readings.

### Maintenance and Compliance

Maintenance and Compliance records are authoritative Admin-entered source facts. The current product may display and edit their saved form data, but it does not calculate maintenance provisions, compliance provisions, break-even, targets, or profitability from them.

### Loan and historical finance records

The current model retains Loan terms as source facts. The Admin UI may display a derived monthly EMI estimate from principal, tenure and annual interest rate; the estimate is not persisted. Historical loan-payment, prepayment, settlement, driver-target, and break-even-input stores are retired and removed by the schema 18 migration. Legacy backup formats remain readable as migration inputs, but those retired store payloads are discarded and are not restored. No payment schedule, payment history, remaining-balance tracking, prepayment, payment allocation or loan ledger is active.

### GPS event snapshots

GPS event snapshots are supporting evidence attached to the four ride event moments: `PICKUP_START`, `TRIP_CANCELLED`, `TRIP_START`, and `TRIP_END`. Keep `capturedAt` and `eventAt` separate. A GPS snapshot must not mutate the ride or shift record. Trip records do not embed pickup/drop GPS objects or locality-resolution status; all four event snapshots live only in the canonical GPS snapshot store. A cancellation snapshot is not a drop-off.

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
- Retired day, odometer-gap, movement-artifact, payment, prepayment, settlement, target, break-even, and financial-period stores are removed from the canonical schema and are not included in new backups.
- Shift, Trip, Fuel, and GPS event evidence remain retained as canonical business/operational history.
- Hard deletion of canonical business records requires an explicit data-destruction action; removing an obsolete feature must not delete its saved records.

## 8. Relationships and mutation boundary

Validate existing canonical relationships at the repository boundary, including Trip → Shift, Compliance/Maintenance → Vehicle, and Driver → Shift/Trip where recorded. Retired finance stores have no active relationship or persistence path.

Canonical persistence and read models must be accessed through the application/repository boundary. Presentation screens must not become a second persistence authority.

## 9. Input and derivation rule

Users enter source facts through the Work or Admin forms. Only the explicitly supported values listed in Section 6 are derived for Performance. Missing or invalid inputs must not be fabricated. Historical fields and records can be preserved without activating their former calculation models.

## 10. Timeline and location evidence boundary

Timeline is a read-only projection of saved ride and fuel records. It must not create or alter business facts.

- GPS capture never starts reverse geocoding. The only locality-resolution entry point is an explicit user-initiated Timeline pull-to-refresh; it may resolve eligible unresolved snapshots when online. Ride actions, app startup, resume, and native snapshot discovery never initiate lookup.
- New reverse geocoding is limited to event timestamps within the latest seven days. Native Android stores coordinates only.
- Successful locality names are stored permanently in PWA IndexedDB keyed by canonical GPS snapshot ID. A saved name is not silently overwritten by ordinary retries.
- If the PWA is offline, show a saved locality when available or the original coordinates when unresolved. Manual Timeline pull-to-refresh is the only action that requests locality resolution; no automatic retry or connectivity polling is permitted.
- Do not use continuous connectivity polling, automatic locality retry loops, or a background geocoding queue. Reject unreliable accuracy, invalid coordinates, distant provider matches, and broad-only locality results.
- Location evidence keeps the provider capture timestamp (`capturedAt`) distinct from the ride event timestamp (`eventAt`).
- A cancellation location is cancellation evidence, not a drop-off location.

## 11. Authority boundary

This document is the sole canonical data-model authority. Phase persistence/operational-record contracts, frozen requirements, audits, recovery gates, and implementation notes may explain or verify this model but may not redefine an entity, source-of-truth field, relationship, or data authority.

If a data rule is discovered in a supporting document, it must be migrated here (or to the business-rule/calculation authority when its responsibility is semantic/formula ownership) before the supporting document is treated as current.

## 12. Removed legacy/supporting stores

Schema version 18 removes the obsolete stores `odoGaps`, `days`, `movement_artifacts`, `loan_payments`, `prepayments`, `driver_targets`, `break_even_inputs`, `settlements`, `financial_period_snapshots`, `driver_collected_data`, `admin_records`, and `financial_inputs`. None has an active product workflow, current calculation authority, or current write path. There is no replacement store or Admin entry.

Backup format version 6 contains only the active canonical records and required recovery evidence. Backup formats 1 through 5 remain accepted as migration inputs: their structure is validated, active in-scope records are retained, and retired store payloads are discarded before restore. Phone export, Dropbox backup, internal recovery checkpoints, and restore all use the same current store set.

The schema migration drops retired object stores on upgrade. It does not rewrite or delete active Shift, Trip, Fuel, GPS, Vehicle, Driver, Compliance, Maintenance, Loan source, Settings, mutation, or audit records.
