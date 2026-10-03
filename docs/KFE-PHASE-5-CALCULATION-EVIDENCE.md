# KFE Phase 5 — Calculation Integration & Traceability Evidence

**Status:** SUPPORTING IMPLEMENTATION / TRACEABILITY EVIDENCE — subordinate to `KFE_BUSINESS_RULES_REGISTER.md` and `docs/KFE-CALCULATION-SPECIFICATION.md`

This document consolidates the former Phase 5 calculation-performance and calculation-traceability documents. The detailed independent verification matrix remains in `docs/CALCULATION-AUTHORITY-MATRIX.md`.

## Purpose

Document the implementation boundary and reverse traceability of material calculations without creating another formula authority.

## Canonical calculation chain

`authoritative input → normalized snapshot → single calculation owner → authoritative/indicative result → dependent calculation → UI metric`

Reverse trace:

`UI metric → service field → calculation owner → authoritative input`

## Ownership

| Concept | Canonical owner/result |
|---|---|
| Shift revenue | completed shift end revenue / authoritative revenue helper |
| Vehicle KM | shift closing minus opening odometer |
| Business KM | validated completed Trip KM |
| Dead KM | vehicle KM minus business KM |
| Fuel rate | qualified full-tank fuel evidence |
| Operating KM forecast | operating-KM forecast domain |
| Monthly break-even | `deriveAuthoritativeBreakEven` |
| Driver Target | `deriveAuthoritativeDriverTarget` |
| Loan position | canonical loan engine |
| Maintenance provision | performance engine |
| Compliance provision | performance engine |
| Actual Profit | financial revenue minus actual operating expenses |
| Performance Actual P/L | Actual Profit minus scheduled EMI |
| Performance Provisional P/L | Performance Actual P/L minus applicable provisions/recoveries |
| Financial facts | financial fact model |

## Boundary rules

1. A calculation must not silently rebuild another calculation owned elsewhere.
2. Authoritative results consume only qualified authoritative dependencies.
3. Indicative results cannot become authoritative inputs.
4. Daily break-even allocates the authoritative monthly break-even; it is not a second cost-build formula.
5. Driver Target remains separate from actual revenue and actual profit.
6. Trip fare is supporting detail; completed shift-end revenue is the ERP revenue authority.
7. Provision balances and actual settlements remain distinct.
8. Forecast exposes calculated and effective values separately.
9. Open-period calculations respect the selected as-of boundary.
10. Derived calculation results are not persisted as replacement business authorities.

## Performance integration

Canonical persisted inputs are normalized into the calculation snapshot, processed by `performanceEngineV2`, then passed through `PerformanceService` to presentation consumers.

PerformanceService may derive presentation representations such as daily break-even, pace variance, and target display values, but it must not introduce competing business formulas.

Canonical mutations propagate through the existing invalidation path into Performance snapshot recomputation.

## Traceability contract

The Phase 5 traceability contract verifies:

- single calculation ownership;
- canonical break-even and Driver Target dependencies;
- financial fact sources;
- operating-KM forecast boundaries;
- five-year synthetic numerical boundaries;
- as-of/future-data isolation;
- Performance UI bindings;
- Actual/Provisional P/L identities.

The Phase 5 calculation-performance contract verifies the same implementation boundary through focused runtime vectors and explicitly guards against reintroducing the old rolling-target calculation path.

Both executable contracts remain in `src/tests/` and are the verification authority; this document only records their scope.

## Exit criteria

- One documented owner per material calculation.
- No targeted duplicate formula authority.
- Evidence state is explicit where qualification can fail.
- Synthetic numerical boundary remains frozen.
- As-of boundary prevents future-data leakage.
- CI executes the calculation-performance and traceability contracts.

## Related evidence

- `docs/CALCULATION-AUTHORITY-MATRIX.md` — detailed 30-row calculation verification matrix and independent-oracle evidence.
- `src/tests/phase5CalculationPerformance.contract.js` — executable performance integration contract.
- `src/tests/phase5CalculationTraceability.contract.js` — executable ownership/traceability contract.
- `docs/KFE-CALCULATION-SPECIFICATION.md` — current calculation authority.

No business formula is changed by this supporting document.
