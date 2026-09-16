# KFE Canonical Data Contract

**Phase:** 1 — Canonical Domain & Data Model  
**Status:** Working contract — freeze pending implementation comparison and contract verification  
**Calendar timezone:** `Asia/Kolkata` (IST)  
**Scope:** Canonical persisted/application data boundary for the single-vehicle KFE ERP

## 1. Contract purpose

This document defines the canonical data contract that implementation, repositories, domain calculations, tests, and future backup/sync layers must preserve.

The contract is intentionally provider-independent. Storage, OCR/AI provider, backup provider, cloud provider, and sync provider must not redefine canonical business meaning.

```text
External / UI / OCR / import / legacy shape
                  ↓
             NORMALIZATION
                  ↓
          CANONICAL ENTITY
                  ↓
             REPOSITORY
                  ↓
          LOCAL PERSISTENCE
                  ↓
     mutation + audit + notification
```

Compatibility aliases belong only at normalization boundaries. Canonical domain logic must use canonical names and semantics.

## 2. Universal identity contract

Every persisted canonical entity has a client-generated UUID named `id`.

Rules:

- IDs are generated on the client, not by an auto-increment database sequence.
- An existing ID is preserved during update.
- IDs are stable across local persistence, backup/restore, migration, and future sync.
- Related records reference the canonical entity ID explicitly.
- Mutation and audit records have their own UUIDs and retain the affected canonical `entityId`.
- No new auto-increment identity may be introduced for canonical entities.

## 3. Universal timestamp and IST contract

Two distinct temporal types must never be conflated.

### 3.1 True instants

Examples: `createdAt`, `updatedAt`, `shiftStartAt`, `shiftEndAt`, `tripStartAt`, `tripEndAt`, `capturedAt`.

- Persist as unambiguous timestamps (ISO 8601 representation is the current implementation convention).
- Represent an actual point in time.
- Business display and calendar grouping use `Asia/Kolkata`.
- Calculations must not reinterpret an instant as a date-only value.

### 3.2 Business calendar dates

Examples: `effectiveFrom`, `validUntil`, `performedOn`, `recordedOn` where the field's meaning is a calendar date rather than an instant.

- Represent an IST calendar date.
- Date-only values must not be converted through UTC midnight before comparison.
- Effective-date and validity comparisons use IST calendar-date semantics.
- Historical/as-of resolution must compare the business date in IST.

```text
INSTANT       → timestamp → interpret/display in IST
BUSINESS DATE → IST date  → compare as calendar date
```

## 4. Universal provenance contract

Provenance answers **where a value came from**. It is distinct from authority, which answers **whether the value is permitted to feed an authoritative calculation**.

Canonical records or field groups that can be supplied by multiple ingestion paths must preserve provenance sufficient to distinguish at least:

- manual/user-entered data;
- OCR/multimodal extraction;
- imported/restored data;
- synthetic/test data;
- system-derived/system-generated data.

The exact persisted enum/string representation remains an implementation detail until all ingestion paths are audited. Implementations must not silently discard known provenance at normalization or persistence boundaries.

Field-level provenance is permitted where only selected fields can have independent origins (for example trip KM and revenue). A universal provenance field must not be added merely for symmetry if it duplicates more precise field-level provenance.

Provenance does not itself grant calculation authority. Authority remains governed by the calculation-authority matrix and the field/entity contract.

## 5. Universal validation contract

Canonical entities must satisfy domain-valid shape and invariant rules before they are accepted by business logic.

Validation must cover, where applicable:

- required identity and relationship fields;
- numeric finiteness, non-negative constraints, and units;
- valid status/lifecycle values;
- temporal ordering (`end >= start` where required);
- effective/validity date semantics;
- referenced entity existence where the relationship is required;
- calculation-specific invariants such as odometer monotonicity where applicable.

Validation must reject invalid canonical data rather than weakening downstream calculations to accommodate it.

## 6. Universal normalization contract

Normalization is the only compatibility boundary between external/persisted variants and canonical domain meaning.

```text
UI / OCR / import / legacy / persisted variant
                    ↓
              entity normalizer
                    ↓
             canonical shape
                    ↓
                 domain
```

Rules:

- Legacy aliases are accepted only at normalization.
- Canonical domain code must not contain alias-resolution logic.
- Normalization converts numeric representations to canonical numeric types where the field is numeric.
- Normalization establishes canonical defaults only where the domain explicitly permits a default.
- Normalization preserves UUIDs and timestamps when supplied and generates them only for genuinely new records at the persistence boundary.
- Normalization must not change business meaning, authority, period, unit, sign, or provenance.
- Each canonical entity type must have an auditable normalization path, even if several paths share implementation helpers.

## 7. Entity canonical contract

### 7.1 Vehicle

**Canonical role:** authoritative vehicle/master-data input.

**Required semantics:** stable UUID, vehicle attributes, timestamps, lifecycle metadata where applicable.

**Relationships:** vehicle is the owning/master context for vehicle-specific operational and administrative records.

**Authority:** stored vehicle attributes are inputs; calculations derive their own results from authoritative operational records.

**Deletion:** administrative deletion is soft deletion; deleted records are excluded from normal active lists and retained for history/sync integrity.

**Repository:** `AdminRepository` / vehicle canonical store.

### 7.2 Driver

**Canonical role:** authoritative driver/master-data input.

**Required semantics:** stable UUID, driver attributes, timestamps, lifecycle metadata where applicable.

**Relationships:** Driver Target references `driverId`; operational records may identify the active driver through the established application relationship.

**Authority:** stored driver attributes are inputs; target calculation owns derived target results.

**Deletion:** administrative soft deletion; historical references remain valid.

**Repository:** `AdminRepository` / driver canonical store.

### 7.3 Shift

**Canonical role:** operational boundary for vehicle movement and shift lifecycle.

**Canonical fields include:** `id`, `startOdometer`, `endOdometer`, `shiftStartAt`, `shiftEndAt`, `status`, shift-level operational/toll/parking fields, timestamps.

**Relationships:** contains/owns trips through `Trip.shiftId`.

**Authority:** `startOdometer` and `endOdometer` are authoritative for vehicle KM. Shift-level `revenue` is an aggregate/lifecycle representation only; it is **not** an independent revenue authority. Trip revenue remains the source of truth for revenue calculations.

**Lifecycle:** operational state includes at least `ACTIVE` and `COMPLETED` in the current model. Allowed transitions must be explicit and tested. Operational status is not equivalent to deletion.

**Deletion:** no universal hard/soft deletion rule is assumed until explicitly implemented and tested. A shift must not be physically removed in a way that silently invalidates historical trip/odometer lineage.

**Repository:** `ShiftTripRepository` / `shifts` store.

### 7.4 Trip / Ride

**Canonical role:** ride-level operational record and source of revenue/business-KM inputs.

**Canonical fields include:** `id`, `shiftId`, `operator`, `tripStartAt`, `tripEndAt`, `status`, start/end locations, `tripKm`, `revenue`, cancellation fields, timestamps, and field-level authority/provenance where applicable.

**Relationships:** every trip belongs to a shift through `shiftId`.

**Authority:** completed-trip `tripKm` is authoritative business KM input; `revenue` is authoritative revenue input. Correction paths explicitly mark manually corrected fields as manual authority.

**Lifecycle:** current operational states include `ACTIVE`, `COMPLETED`, and `CANCELLED`. Only valid transitions may be permitted. Cancellation is an operational outcome, not administrative deletion.

**Deletion:** physical deletion must not be used to erase historical business evidence without an explicit governed deletion contract. Current implementation has no universal trip soft-delete contract; this remains a Phase 1 implementation/test gap.

**Repository:** `ShiftTripRepository` / `trips` store.

### 7.5 Odometer

**Canonical role:** vehicle movement boundary, represented by shift odometer fields in the current single-vehicle model.

**Contract:** `Shift.startOdometer` and `Shift.endOdometer` are the canonical odometer observations used for vehicle KM. A separate persisted Odometer entity must not be introduced merely for normalization symmetry.

**Derived:** `vehicleKm = endOdometer - startOdometer`.

**Validation:** finite numeric values and valid chronological/movement ordering; invalid negative vehicle movement must be rejected unless an explicit correction/replacement workflow exists.

**Repository:** `ShiftTripRepository` / `shifts` store.

### 7.6 Fuel / Refuelling

**Canonical role:** authoritative fuel-log input.

**Canonical fields include:** `id`, `odometer`, `pricePerKg`, `amount`, `quantityKg`, `isFullTank`, capture metadata, timestamps.

**Relationships:** currently single-vehicle by product scope; a `vehicleId` is not required solely to satisfy multi-vehicle normalization. If multi-vehicle scope is introduced, the relationship must be added as a deliberate domain change.

**Authority:** fuel logs are authoritative fuel cost/quantity inputs; derived fuel efficiency/cost-per-km is calculated from their history and applicable boundaries.

**Deletion:** must preserve historical economic lineage; current absence of a universal fuel soft-delete rule is a Phase 1 gap.

**Repository:** `FuelRepository` / `fuel_logs` store.

### 7.7 Expense / cost inputs

**Canonical role:** business concept, not necessarily one generic persisted entity.

Component-specific stores remain canonical where their semantics differ: fuel, maintenance, toll/parking, financing, renewals/compliance, etc.

**Authority:** each component's documented source remains authoritative. A generic Expense aggregate must not become a competing source of truth.

**Repository:** domain-specific repositories (`FuelRepository`, `ShiftTripRepository`, `AdminRepository`, and financing paths as applicable).

### 7.8 Revenue

**Canonical role:** business concept sourced from Trip records.

**Authority:** `Trip.revenue` is the authoritative revenue input for performance calculations. `Shift.revenue` is only a shift-level aggregate/lifecycle representation and must not be independently summed as a second revenue authority.

**Derived:** reporting-period revenue is calculated from authoritative trip records according to status/period rules.

### 7.9 Loan / Financing

**Canonical role:** financing input and financing-event history.

**Stores:** `loans`, `loan_payments`, `prepayments` remain separate typed records because they have distinct semantics.

**Relationships:** payments/prepayments reference `loanId`.

**Authority:** loan terms and schedule define scheduled financing obligation; actual payment/prepayment records define actual financing outflow.

**Deletion:** historical financing lineage must remain recoverable; administrative deletion must not silently erase applied payment/prepayment history.

**Repository:** `AdminRepository` for canonical admin financing records, with financing calculation/domain logic consuming them.

### 7.10 Compliance / Renewal

**Canonical role:** authoritative compliance/renewal input.

**Canonical fields include:** `id`, `vehicleId`, `complianceType`, `validUntil`, cost and timestamps as applicable.

**Time:** `validUntil` is a business calendar date and uses IST date semantics.

**Authority:** persisted compliance validity/cost inputs feed renewal calculations; provision is derived.

**Deletion:** administrative soft deletion while preserving historical records.

**Repository:** `AdminRepository` / `compliance_records`.

### 7.11 Driver Target

**Canonical role:** effective-dated target input and target-domain state.

**Canonical fields include:** `id`, `driverId`, `effectiveFrom`, target inputs, `active`, timestamps.

**Time:** `effectiveFrom` is an IST business date.

**Authority:** stored target inputs are authoritative; Driver Target domain owns derived monthly obligation, rolling balance, remaining obligation, eligible days, and current daily target.

**Important boundary:** current-month actual revenue does not immediately rewrite today's target; active-month variance remains provisional until month close.

**Deletion:** administrative soft deletion while preserving effective-dated history.

**Repository:** `AdminRepository` / `driver_targets`.

### 7.12 Break-even inputs

**Canonical role:** effective-dated cost/input records consumed by the authoritative monthly break-even calculation.

**Authority:** `deriveAuthoritativeBreakEven()` owns the monthly break-even result. Inputs are authoritative data; the result is derived authority.

**Time:** effective dates are IST business dates; historical/as-of selection must use the correct effective record.

**Derived boundary:** daily break-even is a service representation of monthly break-even and is never a competing persisted authority.

**Deletion:** administrative soft deletion while preserving historical calculation lineage.

**Repository:** `AdminRepository` / `break_even_inputs`.

### 7.13 Audit / Mutation

**Canonical role:** durable mutation queue and audit history for canonical changes.

**Mutation:** UUID `id`, `mutationVersion`, `entityId`, `entityType`, `action`, cloned `payload`, status, retry count, `createdAt`.

**Audit:** UUID `id`, `auditVersion`, `mutationId`, `entityId`, `entityType`, `action`, payload, `createdAt`.

**Contract:** a canonical mutation and its audit record are written transactionally with the canonical data mutation where the repository supports mutation/audit coupling.

**Lifecycle:** pending mutation status is sync workflow state, not canonical business lifecycle.

**Repository:** `MutationRepository` and repository-level transactional writers.

### 7.14 Settings

**Canonical role:** configuration, not operational business history.

**Canonical fields:** stable UUID, `settingKey`, structured `values`, timestamps.

**Contract:** settings may affect configuration behavior but must not be mistaken for operational records such as rides, shifts, fuel, or financing events.

**Deletion:** governed as configuration lifecycle; destructive reset must not silently delete canonical operational history.

**Repository:** `AdminRepository` / `settings` store.

## 8. Authoritative versus derived map

The authoritative calculation ownership is defined by `docs/CALCULATION-AUTHORITY-MATRIX.md` and is preserved by this contract. fileciteturn134file0

| Concept | Authority | Derived representation |
|---|---|---|
| Revenue | completed/eligible Trip revenue | reporting-period revenue |
| Vehicle KM | Shift start/end odometer | vehicle KM |
| Business KM | completed Trip KM | business KM |
| Dead KM | derived from vehicle KM − business KM | dead KM |
| Fuel cost/quantity | Fuel logs | efficiency/cost metrics |
| Maintenance | maintenance records | actual maintenance |
| Toll/Parking | shift inputs | reporting totals |
| Financing obligation | loan terms/schedule | scheduled obligation |
| Actual financing outflow | loan payments + applied prepayments | actual outflow |
| Renewal | compliance records | renewal provision |
| Monthly break-even | `deriveAuthoritativeBreakEven()` | monthly BE result |
| Daily break-even | service derivation from monthly BE | `dailyBreakEvenRevenue` |
| Driver Target inputs | `driver_targets` | Driver Target domain outputs |
| Current Driver Target | Driver Target domain | service `target` |
| Pace | performance domain | pace/variance display values |
| Projection | none | not an authority and not required for target logic |

UI code may format and display these results but must not reproduce their business formulas. fileciteturn134file0

## 9. Lifecycle and deletion rules

Operational lifecycle and administrative deletion are separate dimensions.

```text
OPERATIONAL STATE
ACTIVE / COMPLETED / CANCELLED / ...

ADMINISTRATIVE LIFECYCLE
ACTIVE / SOFT-DELETED
```

Rules:

- An operational status transition must never be implemented as deletion.
- Administrative soft deletion must retain identity and historical lineage.
- Active queries exclude administratively deleted records.
- Historical calculations must explicitly define whether deleted records remain part of historical truth; they must not inherit an accidental filter from UI list behavior.
- Hard deletion of canonical business records requires a separately governed data-destruction contract and is not permitted as an incidental repository convenience.
- Entity-specific allowed transitions and deletion permissions must be contract-tested.

Current admin persistence already records `deletedAt`/`deleted`, filters deleted records from normal lists, and writes mutation/audit entries transactionally. fileciteturn137file0

## 10. Mutation propagation

Every canonical mutation path must preserve the freshness chain:

```text
canonical DB mutation
        ↓
canonical-data-changed notification
        ↓
consumer snapshot refresh
        ↓
computed metrics recompute
        ↓
UI update
```

Repository mutation and audit writes must remain atomic with the canonical write where supported. Current Shift/Trip and Admin repository paths already couple mutation/audit persistence and notification to successful transaction completion. fileciteturn137file0 fileciteturn138file0

## 11. Repository ownership contract

| Canonical area | Owner |
|---|---|
| Vehicle / Driver / Compliance / Maintenance / Driver data / Loan / Driver Target / Break-even inputs / Settings | `AdminRepository` and mapped canonical stores |
| Shift / Trip / Odometer | `ShiftTripRepository` and `shifts` / `trips` |
| Fuel | `FuelRepository` and `fuel_logs` |
| Mutation / Audit | `MutationRepository` plus transactional repository writers |
| Monthly break-even result | `deriveAuthoritativeBreakEven` |
| Driver Target derived results | Driver Target domain |
| Performance metrics | Performance domain/service; consumes authorities |

No secondary repository may silently become a competing writer for an authoritative concept.

## 12. Contract-test requirements

Before Phase 1 can freeze, dedicated tests must establish:

1. UUID generation, preservation, and uniqueness expectations.
2. Required entity relationships and orphan-reference behavior.
3. True-instant timestamp semantics.
4. IST date-only semantics across UTC-midnight boundaries.
5. Entity-by-entity normalization into canonical shapes.
6. Provenance preservation across manual/OCR/import/synthetic/system paths that currently exist.
7. Allowed operational lifecycle transitions.
8. Administrative deletion behavior per entity.
9. Mutation/audit linkage and transaction coupling.
10. `canonical-data-changed` propagation across every canonical repository mutation surface.
11. Trip revenue authority versus shift aggregate representation.
12. Shift odometer ownership and vehicle-KM derivation.
13. Settings remaining configuration-only.
14. Historical/as-of effective-date selection for Driver Target and break-even inputs.

Existing calculation authority contracts remain valid and must not be weakened to satisfy canonical-data tests. The contract-test runner is explicitly designed to inventory all suite failures together rather than entering a one-failure-at-a-time correction loop. fileciteturn141file0

## 13. Freeze gate

Phase 1 is **FREEZE READY** only when all of the following are true:

- this canonical contract matches implementation or implementation has been corrected to it;
- no competing authority or duplicate writer remains for an authoritative concept;
- normalization boundaries are explicit and tested;
- provenance semantics are preserved and tested;
- lifecycle/deletion semantics are explicit and tested;
- IST instant/date-only boundaries are regression-tested;
- repository ownership is verified;
- mutation/audit/notification propagation is verified;
- no known related defect remains uninspected;
- one complete verification CI run is green after the holistic regression audit.

Until that gate is met, Phase 1 remains open and Phase 2 must not begin.
