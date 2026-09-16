# KFE Phase 4 — Operational Records Contract

**Phase:** 4 — Operational Records  
**Status:** Working contract — freeze pending focused and full CI verification  
**Calendar timezone:** `Asia/Kolkata` (IST)

## 1. Purpose

Phase 4 makes the canonical operational records usable as one reconstructable working shift/day without introducing a parallel business-data authority.

```text
Shift / odometer boundary
        +
Canonical Trips / revenue + business KM
        +
Fuel logs / fuel cost + quantity
        +
Shift toll / parking
        ↓
Operational reconstruction
```

## 2. Scope

Phase 4 covers:

- shift start/completion and shift odometer boundaries;
- trip records already established by Phase 3;
- refuelling records and full-tank state;
- operational cost inputs represented by their canonical component stores;
- revenue represented by authoritative Trip revenue;
- reconstruction of one working shift/day from canonical records.

Maintenance, compliance/renewal, financing, and other component costs remain their existing domain-specific canonical records. Phase 4 must not introduce a generic Expense authority merely to aggregate them.

## 3. Authority boundaries

- `Shift.startOdometer` and `Shift.endOdometer` remain authoritative for vehicle KM.
- Completed eligible `Trip.revenue` remains the authoritative revenue input.
- Completed eligible `Trip.tripKm` remains the authoritative business-KM input.
- Fuel logs remain authoritative fuel cost/quantity inputs.
- Shift toll/parking fields remain the canonical shift-level toll/parking inputs.
- Dead KM is derived only as vehicle KM minus business KM; Phase 4 does not create a second calculation authority.
- Aggregates returned by operational reconstruction are read/service representations, not persisted authorities.

## 4. Record invariants

- Every Trip belongs to a Shift through `shiftId`.
- Completed Shift vehicle KM is `endOdometer - startOdometer` and cannot be negative.
- Trip end cannot precede Trip start.
- Revenue, trip KM, fuel quantity, fuel price and fuel amount must be finite and non-negative where applicable.
- Cancellation remains an operational Trip status and is not deletion.
- Fuel records retain their canonical UUID and mutation/audit lineage.
- Canonical operational mutations continue to emit `canonical-data-changed` notifications.

## 5. Working shift reconstruction

Given a `shiftId`, the operational reconstruction service must be able to return:

- the canonical Shift;
- all Trips belonging to that Shift in chronological order;
- completed-trip revenue total from Trip records;
- completed-trip business KM total from Trip records;
- vehicle KM when the Shift has a valid end odometer;
- derived dead KM when vehicle KM is available;
- relevant fuel records within the Shift's odometer boundary;
- fuel cost/quantity representation from those fuel records;
- canonical shift toll and parking inputs;
- explicit indication when an operational value is unavailable rather than fabricating it.

These returned totals are reconstruction outputs only. They do not become persisted aggregate authorities.

## 6. Refuelling

Fuel capture remains `FuelRepository` / `fuel_logs`. `isFullTank` is preserved for the later full-tank fuel-efficiency calculation chain. Phase 4 does not replace or duplicate the financial fuel authority.

## 7. Expenses and revenue

Expense is a business concept composed of typed canonical inputs. Fuel, maintenance, toll/parking, financing, and renewal/compliance retain their existing stores and owners. Revenue is sourced from Trips. A Phase 4 service may present a combined operational summary but must not persist a generic expense total or shift revenue as a competing authority.

## 8. Lifecycle and history

Operational records are append/history-preserving. Shift and Trip status transitions remain repository-controlled; Fuel has no incidental hard-delete path. Administrative soft deletion rules from the Phase 1 canonical contract remain unchanged for applicable administrative records.

## 9. Provider independence

Phase 4 has no dependency on OCR/AI, cloud backup, cloud sync, or a specific storage provider beyond the frozen local-first persistence boundary.

## 10. Exit condition

Phase 4 is complete when a canonical Shift can be reconstructed into an operational working shift/day using its canonical Shift, Trip, Fuel, toll/parking and applicable operational inputs, with one authority per business concept and preserved mutation/audit lineage.
