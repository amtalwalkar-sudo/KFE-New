# KFE Pre-CI Holistic Audit

**Branch:** `audit/calculation-chain-hardening`
**Audit date:** 2026-09-16
**Audit conclusion:** `PRE-CI CERTIFIED — NO KNOWN AUTHORITY / PERIOD / UNIT / ARCHITECTURE CONFLICTS`

> The GitHub pull-request workflow may auto-start after branch pushes; that automatic workflow is not being used as the audit mechanism or as evidence of correctness. The certificate below is based on the repository audit and contracts.

## Audit model

```text
Frozen KFE design
  ↓
Persistence
  ↓
Normalization
  ↓
Actual economics
  ↓
Monthly break-even
  ↓
Monthly desired driver profit
  ↓
Rolling balance
  ↓
Dynamic daily representation
  ↓
Pace / forecast boundary
  ↓
Application/service boundaries
  ↓
UI
  ↓
Mutation → invalidation → recompute → UI
  ↓
Adversarial cases
  ↓
PRE-CI CERTIFICATE
```

Every calculation was checked for authority, source lineage, period, unit, sign, ownership, historical/as-of isolation, and mutation propagation.

## Final gate status

| Gate | Area | Status | Conclusion |
|---|---|---|---|
| 1 | Persistence | 🟢 PASS | Performance reads the canonical calculation snapshot through the repository boundary; no duplicate calculation DB is used as a Performance authority. |
| 2 | Normalization | 🟢 PASS | Persisted aliases resolve once into canonical fields and are removed before domain calculation. |
| 3 | Actual economics | 🟢 PASS | Revenue, vehicle KM, business KM, dead KM, fuel, maintenance, toll, parking, financing and renewal have identified owners. GPS movement accounting is estimate/reconciliation support, not the actual Performance authority. |
| 4 | Monthly break-even | 🟢 PASS | `deriveAuthoritativeBreakEven()` is the single monthly BE formula owner. Service/UI consume its result; daily BE is derived only from monthly BE. |
| 5 | Driver Target | 🟢 PASS | Effective monthly obligation = monthly BE + desired driver profit + opening rolling balance. Driver Target does not feed actual economics or BE. |
| 6 | Rolling balance | 🟢 PASS | Opening → monthly variance → closing is monthly and only closed-month state rolls forward. Active-month variance remains provisional. |
| 7 | Daily representation | 🟢 PASS | Remaining obligation is divided by remaining eligible calendar/financial days. `workingDays` is not a competing divisor. Holidays consume no allocation. |
| 8 | Pace / projection | 🟢 PASS | Pace compares actual ₹/financial day with required ₹/financial day. Projection is outside the target authority and no period-mixed target gap remains in the canonical pace contract. |
| 9 | UI / architecture | 🟢 PASS | Performance UI is display/state orchestration only, subscribes through `PerformanceService`, and cannot bypass repository/domain boundaries under the architecture contract. |
| 10 | Adversarial end-to-end | 🟢 PASS | Contracts cover future leakage, soft deletes, zero-trip holidays, rolling state, desired-profit isolation, dynamic denominator, malformed loans, normalization variants, IST boundaries, invalidation boundaries and arithmetic/legacy guards. |

## Findings discovered and resolved by the holistic audit

### A. Architecture boundary violation — RESOLVED

The earlier CI failure was caused by presentation/application subscription code reaching raw IndexedDB. The subscription chain is now:

```text
PerformanceView
  → PerformanceService
  → canonicalDataChangeRepository
  → persistence event source
```

The architecture contract remains strict; it was not weakened.

### B. Historical/as-of wall-clock leakage — RESOLVED

`performanceEngineV2` previously used `Date.now()` for `elapsedDays`. That made historical/custom reporting depend on the machine clock. `elapsedDays` is now derived from the selected IST-bounded reporting range.

### C. Monthly BE incorrectly dependent on a completed trip day — RESOLVED

`PerformanceService` previously selected the monthly BE only when it found a completed trip in the selected range. That incorrectly made a monthly business requirement unavailable on a zero-trip day. The service now consumes `metrics.monthlyBreakEvenRevenue` directly from the authoritative domain result. Driver Target availability remains separately dependent on financial-day availability.

### D. Stale duplicate authorities — RESOLVED

Removed:

- `src/services/mileageAccountingService.js`
- `src/services/revenueReconciliationService.js`

These represented obsolete/competing mileage and shift/`uberRevenue` revenue semantics.

### E. Stale tests encoding superseded semantics — RESOLVED

Corrected:

- `financialModel.contract.js` to assert `monthlyBreakEvenRevenue` rather than the obsolete period-level BE field.
- `calculationBoundary.confirmed.contract.js` to use the dynamic remaining-day denominator rather than a `workingDays`-style `+250` expectation.

### F. Arithmetic boundary protection — ADDED

`calculationArithmetic.contract.js` scans all relevant JS/Vue source directories for known prohibited financial-authority arithmetic and legacy target aliases, and verifies that domain code has no wall-clock dependency and that the monthly BE formula has one owner.

### G. Invalidation boundary protection — ADDED

`calculationInvalidation.contract.js` verifies that calculation-relevant persistence writers emit canonical data-change notifications and that PerformanceService/UI are connected through the repository/application subscription boundary.

## Mutation propagation matrix

| Mutation | Actual metrics | Monthly BE | Driver Target | UI refresh |
|---|---|---|---|---|
| Completed trip revenue | Changes | No | Changes current-month allocation/variance state as applicable | Yes |
| Completed trip KM | Changes business/dead KM | No directly | No direct target-input change | Yes |
| Shift odometer | Changes vehicle/dead KM | Can change | Can change through BE | Yes |
| Fuel amount/quantity | Changes actual fuel | Can change fuel-cost authority | Can change through BE | Yes |
| Maintenance actual cost | Changes actual cost/profit | No, unless BE provision input changes | No direct change | Yes |
| Compliance validity/cost | Changes renewal economics | Can change | Can change through BE | Yes |
| Loan schedule/payment/prepayment | Changes financing/cash; scheduled obligation can change BE | Can change | Can change through BE | Yes |
| Desired driver profit | No | No | Changes target only | Yes |
| Break-even input | No actual-history rewrite | Changes | Changes target through BE | Yes |
| Soft delete | Removes source record from calculations | Can change if source was BE input | Can change if source was target/financial input | Yes |
| Backup restore | Replaces canonical dataset | Recomputed | Recomputed | Yes |
| Future-dated record | No effect before as-of boundary | No effect before as-of boundary | No effect before as-of boundary | No historical leakage |

## Timezone audit

Business timezone is `Asia/Kolkata` / IST. Day, month, reporting-range and financial-day classification use the IST helpers. The performance engine now also avoids machine-clock dependence for historical reporting metadata.

## UI arithmetic audit

The Performance UI consumes metrics and layer rows from the application/domain calculation boundary. Its local arithmetic is limited to formatting, interaction state, validation/display mechanics and non-authoritative work-module UI behavior. It does not reproduce monthly BE, Driver Target, daily BE, rolling balance, or pace formulas.

## CI gate

The audit is complete **before relying on CI as evidence**. The next full CI result is therefore a verification step, not a discovery loop.

**No merge. No phone test. No cosmetic/UI work based on CI success alone.**