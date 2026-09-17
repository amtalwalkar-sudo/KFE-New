# KFE Canonical Data Contract

**Phase:** Canonical Domain & Data Model / ERP input audit  
**Status:** Working contract aligned with current implementation  
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
             REPOSITORY
                  ↓
          LOCAL PERSISTENCE
                  ↓
     mutation + audit + notification
```

Compatibility aliases belong only at normalization boundaries. Canonical domain logic uses canonical names and semantics.

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

### Vehicle

Authoritative vehicle/master-data input. Administrative deletion is soft deletion; identity and historical references remain available.

### Driver

Authoritative driver/master-data input. Administrative deletion is soft deletion; historical references remain available.

### Shift

Operational boundary for vehicle movement and shift lifecycle. `Shift.startOdometer` and `Shift.endOdometer` are authoritative for vehicle KM.

**Revenue authority:** `Shift.revenue`, entered/confirmed at shift completion, is the authoritative ERP revenue input for the shift. It is the value used by performance, target, break-even and reporting calculations that require operational revenue.

A Shift cannot be administratively deleted through the normal Admin repository. Corrections are updates to the Work-created source record and are audited.

### Trip / Ride

Ride-level operational detail linked to a Shift through `shiftId`. Completed `tripKm` is the authoritative business-KM input.

`Trip.revenue` is **optional supporting/detail data only**. It must never override or replace shift-end revenue in ERP revenue calculations. Its provenance may be retained for audit and ride-level display.

Ride cancellation is an operational status/outcome, not deletion. Trip history is retained.

### Odometer

No separate persisted Odometer entity is required in the current single-vehicle model. Shift start/end odometer observations own vehicle movement.

`vehicleKm = Shift.endOdometer - Shift.startOdometer`.

### Fuel / Refuelling

`fuel_logs` are authoritative fuel cost/quantity inputs. Fuel efficiency and rolling fuel cost/km are derived from fuel-log history and applicable boundaries.

### Maintenance

`maintenance_records.cost` and related source fields are authoritative maintenance inputs. Maintenance provisions and reporting aggregates are derived.

### Compliance / Renewal

`compliance_records` are authoritative compliance and renewal inputs. Validity uses IST calendar-date semantics; renewal provision is derived.

### Loan / Financing

`loans` contain explicit contractual source terms for each loan: lender/reference where applicable, principal, tenure, start date, and **`annualInterestRatePercent`**. There is **no KFE-wide default interest rate**.

The finance domain calculates EMI and financing results from the individual loan's explicit terms. Stored contractual terms are authoritative once active.

Normal edit of an existing loan cannot change contractual source terms. Genuine contractual correction uses `AdminRepository.correctLoan(values, correctionReason, existingId)`, which recalculates EMI from the corrected explicit terms and writes an audited `CORRECTION` mutation. A correction reason is required.

Loan status (`Active`, `Closed`, `Settled`) is lifecycle state and is distinct from administrative deletion. Performance finance selection considers only a non-deleted `Active` loan whose start date is effective as of the reporting boundary.

`loan_payments` are authoritative actual-payment events. `prepayments` are authoritative actual prepayment events. Scheduled obligation and actual financing outflow remain separate concepts.

### Driver Target

`driver_targets` are effective-dated authoritative target inputs. The Driver Target domain owns rolling obligation, remaining obligation, eligible days, and current daily target.

### Break-even Inputs

`break_even_inputs` are effective-dated authoritative cost inputs. `deriveAuthoritativeBreakEven()` owns the monthly break-even result. Daily break-even is only a derived service representation.

### Audit / Mutation

Canonical writes that support mutation/audit coupling write the canonical record, pending mutation, and audit history transactionally. Mutation/audit records have their own UUIDs and retain the affected canonical `entityId`.

## 6. Authoritative calculation map

| Concept | Authority | Derived result |
|---|---|---|
| Shift revenue | completed Shift `revenue` | reporting-period revenue |
| Trip revenue | supporting-only `Trip.revenue` | ride detail/display only |
| Vehicle KM | Shift start/end odometer | `vehicleKm` |
| Business KM | completed Trip `tripKm` | `businessKm` |
| Dead KM | vehicle KM − business KM | `deadKm` |
| Fuel cost/quantity | Fuel logs | efficiency/cost metrics |
| Maintenance | Maintenance records | actual maintenance/provision |
| Toll/Parking | Shift inputs | reporting totals |
| Scheduled financing | Loan terms + schedule | scheduled obligation |
| Actual financing outflow | Loan payments + applied prepayments | actual financing outflow |
| Renewal | Compliance records | renewal provision |
| Monthly break-even | Break-even inputs + canonical monthly cost inputs | monthly break-even revenue |
| Driver Target inputs | Driver Target records | target-domain outputs |
| Current Driver Target | Driver Target domain | service/UI target |
| Pace | performance domain | pace and variance |

No UI or presentation component may reproduce these formulas or create a competing authority.

## 7. Lifecycle and deletion

Operational lifecycle and administrative deletion are separate dimensions.

```text
OPERATIONAL STATE
ACTIVE / COMPLETED / CANCELLED / ...

ADMINISTRATIVE LIFECYCLE
ACTIVE / SOFT-DELETED
```

- Vehicle, Driver, Compliance, Maintenance, Loan, Loan Payment, Prepayment, Driver Target and Break-even input records use governed Admin soft deletion.
- Shift, Trip and Fuel repositories do not expose incidental physical deletion; historical business evidence remains retained.
- Operational status transitions are never implemented as deletion.
- Soft-deleted records are excluded from normal active lists and live calculation snapshots unless a calculation explicitly defines historical inclusion.
- Hard deletion of canonical business records requires a separately governed data-destruction contract.

## 8. Relationships and mutation boundary

Required relationships are validated at the repository boundary, including Trip → Shift, Compliance/Maintenance → Vehicle, Driver Target → Driver, and Loan Payment/Prepayment → Loan.

Canonical mutation propagation is:

```text
Canonical DB mutation
      ↓
canonical-data-changed notification
      ↓
Performance snapshot refresh
      ↓
computed metrics recompute
      ↓
UI updates
```

## 9. ERP input rule

Users enter source facts and contractual/source inputs. KFE derives values that are mathematically determined from those inputs.

Manual input must not be provided for derived values such as ride duration, total vehicle KM, dead KM, fuel quantity when calculated from amount/price, EMI, interest/principal allocation, outstanding balance, financing outflow, renewal provision, maintenance provision, break-even revenue, or target calculations.

Shift-end revenue is the explicit exception to any ride-level revenue detail: it is a user-entered source fact and is the ERP revenue authority.

## 10. Removed legacy/supporting store

`driver_collected_data` is not part of the current canonical model. The former store was supporting-only and did not own an independent calculation authority; its operational fields duplicated facts already owned by Shift/Work or had no authoritative ERP calculation role.

The canonical database migration from version 9 to version 10 explicitly removes the obsolete store. New backups no longer contain it. Backup format version 3 remains backward-compatible with legacy format versions 1 and 2 by accepting and discarding the removed `driver_collected_data` payload during validation/upgrade before restore.

There is intentionally no replacement Admin entry for generic driver-collected data. Operational facts have one natural entry point and one authority.
