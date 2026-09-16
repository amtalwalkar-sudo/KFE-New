# KFE Pre-CI Holistic Audit

**Branch:** `audit/calculation-chain-hardening`
**Audit date:** 2026-09-16
**CI status:** intentionally not run as the audit gate
**Objective:** establish system-level consistency before the next CI run so CI verifies the result rather than discovering the next isolated defect.

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

Every calculation is checked for authority, source lineage, period, unit, sign, ownership, historical/as-of isolation, and mutation propagation.

## Gate status

| Gate | Area | Status | Finding |
|---|---|---|---|
| 1 | Persistence | 🟢 | Canonical calculation snapshot reads canonical stores through repositories; no duplicate calculation DB is used by Performance. |
| 2 | Normalization | 🟢 | Persisted compatibility aliases are resolved at the application normalization boundary and removed from normalized records. |
| 3 | Actual economics | 🟢 | Revenue, vehicle KM, business KM, dead KM, fuel, maintenance, toll, parking, financing and renewal have identified calculation owners. GPS movement accounting is explicitly treated as estimation/reconciliation support, not the Performance authority. |
| 4 | Monthly break-even | 🟢 | `deriveAuthoritativeBreakEven()` is the monthly BE formula owner; the service no longer makes BE availability depend on a completed trip day. |
| 5 | Driver Target | 🟢 | Monthly BE + monthly desired driver profit + opening rolling balance is the effective monthly obligation. |
| 6 | Rolling balance | 🟢 | Closed-month variance rolls; active-month variance remains provisional. |
| 7 | Daily representation | 🟢 | Dynamic remaining eligible days are used; `workingDays` is not a competing divisor. |
| 8 | Pace / projection | 🟢 | Pace uses ₹/financial-day against ₹/financial-day; projection is removed from target authority. |
| 9 | UI / architecture | 🟢 | Performance UI consumes `PerformanceService`; persistence remains behind repository/application boundaries. |
| 10 | Adversarial / end-to-end | 🟡 | Core adversarial contracts are present, but the final repo-wide arithmetic classification and exhaustive mutation-path audit are still open. |

## Closure pass completed

### As-of reporting purity — CLOSED

`performanceEngineV2` no longer uses wall-clock `Date.now()` for `elapsedDays`. Reporting metadata is now derived entirely from the selected IST-bounded reporting range, so historical/custom calculations are deterministic and isolated from the machine clock.

### Monthly break-even independence — CLOSED

`PerformanceService` now consumes the authoritative monthly BE produced by the domain engine even when the selected period contains zero completed trips. A financial trip day is required for Driver Target availability, but it is not a prerequisite for the monthly break-even business requirement. An adversarial contract now locks this distinction.

### Stale duplicate calculation services — CLOSED

Removed:

- `src/services/mileageAccountingService.js`
- `src/services/revenueReconciliationService.js`

The first independently calculated vehicle/inter-shift mileage from an obsolete repository and the second used obsolete shift/`uberRevenue` reconciliation semantics. The architecture contract now explicitly prevents either path from being reintroduced.

### Arithmetic boundary guard — ADDED

A new `calculationArithmetic.contract.js` is part of the standard test gate. It checks presentation/domain boundaries for known financial-authority arithmetic, legacy target aliases, wall-clock use in domain calculations, and the single monthly BE formula owner.

### GPS movement accounting — CLASSIFIED

`domain/movement/movementAccounting.js` remains a separate estimation/reconciliation capability. Its GPS-derived segments are marked with explicit estimate/manual/odometer-remainder authority labels and are not consumed by the authoritative Performance calculation chain. The frozen actual vehicle-KM authority remains shift end odometer minus shift start odometer.

## Confirmed architectural chain

```text
Canonical DB mutation
  → canonical-data-changed event
  → repository/application subscription boundary
  → fresh Performance snapshot
  → normalization
  → domain metrics
  → Vue computed state
  → UI
```

Confirmed mutation notifications currently include:

- Admin source records: vehicle, driver, compliance, maintenance, driver-collected data, loan, loan payment, prepayment, driver target, break-even inputs.
- Shift/trip lifecycle and trip corrections.
- Fuel logs.
- Full canonical backup restore.

This means the calculation-relevant sources currently feeding Performance have an invalidation path. Location/GPS and local-backup-only writes do not alter Performance metrics and therefore do not need to trigger a calculation refresh.

## Remaining pre-CI audit work

### 1. Repo-wide arithmetic sweep

Inspect `/`, `*`, `+`, and `-` usage across UI, stores, application services and domain code and classify each occurrence as:

- formatting/UI-only;
- validation;
- legitimate domain calculation with an identified owner;
- duplicate authority;
- stale/legacy calculation.

Specifically check for:

- period-mixed comparisons;
- `workingDays` divisors;
- monthly BE formulas outside `deriveAuthoritativeBreakEven()`;
- legacy target fields surviving past normalization;
- projection-based target logic;
- UI financial arithmetic;
- duplicated revenue/KM/cost authorities.

### 2. Mutation-path audit — final verification

The major mutation paths are confirmed, but the final audit must verify the complete call graph rather than relying only on repository inspection. Each calculation-relevant write must end in the canonical data-change event after the transaction commits.

### 3. Adversarial propagation matrix

For each source mutation, verify exactly which outputs are allowed to change and which must remain invariant. Minimum matrix:

- trip revenue / trip KM;
- shift start/end odometer;
- fuel amount / quantity;
- maintenance cost;
- compliance validity/cost;
- loan schedule/payment/prepayment;
- desired driver profit;
- break-even inputs;
- soft delete;
- backup restore;
- future-dated record insertion.

## Non-negotiable final condition

No CI run is considered the audit itself. The next CI run occurs only after all 🟡 findings above are resolved and the pre-CI certificate can honestly be marked:

`PRE-CI CERTIFIED — NO KNOWN AUTHORITY / PERIOD / UNIT / ARCHITECTURE CONFLICTS`

Only then should the single full CI run be used as confirmation.
