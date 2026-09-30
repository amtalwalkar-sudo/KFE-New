# KFE Phase 5 Calculation & Performance Contract

**Phase:** 5 — Calculation & Performance Integration  
**Status:** Working contract  
**Calendar timezone:** `Asia/Kolkata`

## Purpose

Connect canonical operational records to the protected calculation and performance chain without introducing competing authorities.

## Authoritative calculation chain

```text
Canonical persisted inputs
        ↓
calculation snapshot normalization
        ↓
performanceEngineV2
        ↓
authoritative domain calculations
        ↓
PerformanceService integration / derived representations
        ↓
presentation consumers
```

## Required authority boundaries

- Completed Trip revenue is the revenue authority.
- Shift start/end odometer is the vehicle-KM authority.
- Completed validated Trip KM is the business-KM authority.
- Dead KM is derived as vehicle KM minus business KM.
- Fuel logs are the fuel quantity/cost authority.
- Actual maintenance, toll, parking, financing, and renewal inputs retain their canonical sources.
- `deriveAuthoritativeBreakEven()` is the sole monthly break-even authority.
- `deriveRollingDriverTarget()` is the sole Driver Target authority.
- `PerformanceService` consumes those authorities and may derive representations such as daily break-even, pace variance, and target display values; it must not create competing business formulas.
- Projection is not an authority and is not required for Driver Target.

## Period and boundary rules

- Actual economics use the selected reporting period.
- Monthly break-even uses the applicable IST calendar month and selected end as an as-of cap for an open/current month.
- Closed months use the complete IST calendar month.
- Historical/as-of effective dates use IST calendar-date semantics.
- Driver Target remains a monthly obligation allocated over remaining eligible financial days.
- Holidays/off days consume no target allocation.
- Current-month actual revenue does not immediately alter today's Driver Target.

## Calculation invariants

- Units and periods must be compatible before arithmetic.
- Missing/unsupported authoritative inputs remain unavailable; they are not silently invented.
- Negative dead KM is an integrity exception.
- Actual operating profit is revenue minus actual operating cost and does not subtract planning provisions.
- Available Cash subtracts actual financing outflow, not merely scheduled unpaid obligation.
- Maintenance provision remains separate from actual maintenance.
- Full-tank fuel efficiency/cost observations use the existing fuel calculation authority.

## Mutation and freshness

Canonical mutations continue to propagate through `canonical-data-changed` into the Performance snapshot and metric recomputation. Calculation results are derived and must not be persisted as replacement business authorities.

## Exit condition

A canonical calculation snapshot can produce a reproducible performance result for a selected range, with break-even and Driver Target obtained from their existing authoritative owners, without duplicate formulas or provider coupling. Focused Phase 5 contract coverage and the full CI workflow must be green before Phase 5 is considered complete/freeze-ready.
