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

The current implementation exposes a universal Admin normalization/validation path for every Admin canonical form, plus repository-boundary normalization and invariants for Shift/Trip/Fuel. Contract tests cover those paths explicitly.

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

Current coverage is explicit for Shift, Trip, Fuel and all Admin canonical forms. Calculation snapshots use the same canonical operational normalizers rather than creating a second semantic normalization rule.

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

**Lifecycle:** operational state includes at least `ACTIVE` and `COMPLETED` in the current model. Allowed transitions are repository-controlled; operational status is not equivalent to deletion.

**Deletion:** Shift has no incidental repository hard-delete operation. Historical shift/odometer lineage is therefore retained unless a separately governed data-destruction workflow is introduced.

**Repository:** `ShiftTripRepository` / `shifts` store.

### 7.4 Trip / Ride

**Canonical role:** ride-level operational record and source of revenue/business-KM inputs.

**Canonical fields include:** `id`, `shiftId`, `operator`, `tripStartAt`, `tripEndAt`, `status`, start/end locations, `tripKm`, `revenue`, cancellation fields, timestamps, and field-level authority/provenance where applicable.

**Relationships:** every trip belongs to a shift through `shiftId`.

**Authority:** completed-trip `tripKm` is authoritative business KM input; `revenue` is authoritative revenue input. Correction paths explicitly mark manually corrected fields as manual authority.

**Lifecycle:** current operational states include `ACTIVE`, `COMPLETED`, and `CANCELLED`. Cancellation is an operational outcome, not administrative deletion.

**Deletion:** Trip has no incidental repository hard-delete operation. Historical trip evidence is retained unless a separately governed data-destruction workflow is introduced.

**Repository:** `ShiftTripRepository` / `trips` store.

### 7.5 Odometer

**Canonical role:** vehicle movement boundary, represented by shift odometer fields in the current single-vehicle model.

**Contract:** `Shift.startOdometer` and `Shift.endOdometer` are the canonical odometer observations used for vehicle KM. A separate persisted Odometer entity must not be introduced merely for normalization symmetry.

**Derived:** `vehicleKm = endOdometer - startOdometer`.

**Validation:** finite numeric values and valid chronological/movement ordering; invalid negative vehicle movement is rejected unless an explicit correction/replacement workflow exists.

**Repository:** `ShiftTripRepository` / `shifts` store.

### 7.6 Fuel / Refuelling

**Canonical role:** authoritative fuel-log input.

**Canonical fields include:** `id`, `odometer`, `pricePerKg`, `amount`, `quantityKg`, `isFullTank`, capture metadata, timestamps.

**Relationships:** currently single-vehicle by product scope; a `vehicleId` is not required solely to satisfy multi-vehicle normalization. If multi-vehicle scope is introduced, the relationship must be added as a deliberate domain change.

**Authority:** fuel logs are authoritative fuel cost/quantity inputs; derived fuel efficiency/cost-per-km is calculated from their history and applicable boundaries.

**Deletion:** Fuel has no incidental repository hard-delete operation. Historical fuel economic lineage is retained unless a separately governed data-destruction workflow is introduced.

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

**Deletion:** these financing records use the governed Admin soft-delete path; deletion retains identity and mutation/audit lineage and does not physically remove the canonical record.

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

**Time:** effective dates are IST business dates; historical/as-of selection uses the correct effective record.

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

The authoritative calculation ownership is defined by `docs/CALCULATION-AUTHORITY-MATRIX.md` and is preserved by this contract.

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

UI code may format and display these results but must not reproduce their business formulas.

## 9. Lifecycle and deletion rules

Operational lifecycle and administrative deletion are separate dimensions.

```text
OPERATIONAL STATE
ACTIVE / COMPLETED / CANCELLED / ...

ADMINISTRATIVE LIFECYCLE
ACTIVE / SOFT-DELETED
```

### Entity-specific contract

| Entity group | Operational lifecycle | Administrative deletion | Historical rule |
|---|---|---|---|
| Vehicle / Driver | master-data status | Admin soft-delete | retain identity and references |
| Compliance / Maintenance / Driver data | source-record state | Admin soft-delete | retain historical record |
| Loan / Loan Payment / Prepayment | financing-record status | Admin soft-delete | retain financing lineage |
| Driver Target / Break-even inputs | effective-dated source state | Admin soft-delete | retain effective history |
| Settings | configuration lifecycle | governed Admin lifecycle | operational history is not deleted by reset |
| Shift | `ACTIVE` / `COMPLETED` | no incidental hard-delete operation | retain odometer/trip lineage |
| Trip | `ACTIVE` / `COMPLETED` / `CANCELLED` | no incidental hard-delete operation | cancellation is retained as business evidence |
| Fuel | fuel-log record | no incidental hard-delete operation | retain economic lineage |
| Audit / Mutation | workflow/audit state | mutation removal only under sync workflow rules | preserve audit meaning |

Rules:

- An operational status transition must never be implemented as deletion.
- Administrative soft deletion must retain identity and historical lineage.
- Active queries exclude administratively deleted records.
- Historical calculations must explicitly define whether administratively deleted records remain part of historical truth; they must not inherit an accidental filter from UI list behavior.
- Hard deletion of canonical business records requires a separately governed data-destruction contract and is not permitted as an incidental repository convenience.
- Entity-specific lifecycle/deletion behavior is contract-tested for the current implementation: Admin entities use soft deletion; Shift/Trip/Fuel have no incidental physical deletion path.

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

Repository mutation and audit writes must remain atomic with the canonical write where supported. Current Shift/Trip, Fuel and Admin repository paths couple mutation/audit persistence and notification to successful transaction completion.

## 11. Repository ownership contract

| Canonical area | Owner |
|---|---|
| Vehicle | `AdminRepository` → `vehicles` |
| Driver | `AdminRepository` → `drivers` |
| Compliance | `AdminRepository` → `compliance_records` |
| Maintenance | `AdminRepository` → `maintenance_records` |
| Driver-collected data | `AdminRepository` → `driver_collected_data` |
| Loan | `AdminRepository` → `loans` |
| Loan payment | `AdminRepository` → `loan_payments` |
| Prepayment | `AdminRepository` → `prepayments` |
| Driver Target | `AdminRepository` → `driver_targets` |
| Break-even inputs | `AdminRepository` → `break_even_inputs` |
| Settings | `AdminRepository` → `settings` |
| Shift | `ShiftTripRepository` → `shifts` |
| Trip / Ride | `ShiftTripRepository` → `trips` |
| Odometer observations | `ShiftTripRepository` → Shift fields in `shifts` |
| Fuel / Refuelling | `FuelRepository` → `fuel_logs` |
| Mutation queue | `MutationRepository` → `pending_mutations` |
| Audit history | `MutationRepository` / transactional repository writers → `audit_history` |

No supporting store may silently become a replacement business authority. `days`, `odoGaps`, `gps_snapshots`, and `movement_artifacts` remain supporting/infrastructure stores.

## 12. Relationship and historical/as-of contract

Canonical relationships are explicit and validated where required:

- Trip → Shift through `shiftId`.
- Compliance → Vehicle through `vehicleId`.
- Maintenance → Vehicle through `vehicleId`.
- Driver-collected data → Driver and Vehicle.
- Loan payment → Loan through `loanId`.
- Prepayment → Loan through `loanId`.
- Driver Target → Driver through `driverId`.

Required relationships must reference an existing non-deleted canonical record at the Admin repository boundary.

Effective-dated authorities use IST calendar-date semantics. Historical/as-of selection must resolve the record effective on the requested IST business date; it must not compare raw UTC-midnight conversions for date-only values.

The break-even and Driver Target authorities are explicitly covered by IST boundary tests, and no selected reporting range may create a second effective-date authority.

## 13. Phase 1 completeness reconciliation

The implementation comparison and contract suite cover the Phase 1 dependency chain:

```text
Persisted inputs
      ↓
Normalization
      ↓
Canonical entities
      ↓
Relationships
      ↓
Authoritative vs derived
      ↓
UUID / identity
      ↓
timestamps / IST
      ↓
validation / provenance
      ↓
delete / lifecycle
      ↓
repository boundary
      ↓
tests / contracts
```

The current contract deliberately does **not** introduce:

- a separate persisted Odometer entity;
- a generic Expense authority;
- a second revenue authority;
- a second break-even authority;
- a second Driver Target authority;
- an OCR/AI provider dependency;
- a backup/sync provider dependency.

The exact provenance enum remains intentionally open until all ingestion paths are implemented; known provenance is nevertheless preserved on the currently audited Trip/Fuel paths. This is an implementation detail, not a competing canonical meaning.

Phase 1 remains freeze-pending until the complete contract suite passes and the subsequent holistic regression audit confirms that implementation, contract, authority, relationship, lifecycle, and historical/as-of semantics remain aligned.
