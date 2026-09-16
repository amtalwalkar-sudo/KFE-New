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
| 3 | Actual economics | 🟢 | Revenue, vehicle KM, business KM, dead KM, fuel, maintenance, toll, parking, financing and renewal have identified calculation owners. |
| 4 | Monthly break-even | 🟢 | `deriveAuthoritativeBreakEven()` is the monthly BE formula owner; daily BE is derived from that result. |
| 5 | Driver Target | 🟢 | Monthly BE + monthly desired driver profit + opening rolling balance is the effective monthly obligation. |
| 6 | Rolling balance | 🟢 | Closed-month variance rolls; active-month variance remains provisional. |
| 7 | Daily representation | 🟢 | Dynamic remaining eligible days are used; `workingDays` is not a competing divisor. |
| 8 | Pace / projection | 🟢 | Pace uses ₹/financial-day against ₹/financial-day; projection is removed from target authority. |
| 9 | UI / architecture | 🟢 | Performance UI consumes `PerformanceService`; the persistence boundary is repository-owned. |
| 10 | Adversarial / end-to-end | 🟡 | Existing adversarial contracts cover future leakage, deletes, malformed inputs, holidays, rolling and target invariants; broader mutation-path and repo-wide arithmetic audit remains to be closed. |

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

Admin, shift/trip, fuel and backup restore mutation paths emit the canonical data-change notification. The application subscription boundary prevents presentation from importing raw IndexedDB.

## Findings that must be closed before the pre-CI certificate

### 1. Reporting as-of purity

`performanceEngineV2` currently derives the `elapsedDays` display metadata using `Date.now()`. Core financial authorities are bounded by the selected range, but this reporting field can therefore depend on wall-clock time for historical/custom ranges. It must be made range/as-of deterministic before certification.

### 2. Stale calculation services

`src/services/mileageAccountingService.js` is stale relative to the canonical architecture: it imports a `ShiftRepository` that no longer exists and independently calculates vehicle-distance/inter-shift mileage concepts that are now owned by the canonical performance calculation chain.

`src/services/revenueReconciliationService.js` is also stale: it treats shift revenue and `uberRevenue` as reconciliation inputs while the current canonical revenue authority is completed trip records.

These files must be removed or explicitly quarantined from the active architecture before certification; they must not remain silent alternative calculation authorities.

### 3. Repo-wide arithmetic sweep

The remaining audit must inspect `/`, `*`, `+`, and `-` usage across UI, stores, application services and domain code and classify each occurrence as:

- formatting/UI-only;
- validation;
- legitimate domain calculation with an identified owner;
- duplicate authority;
- stale/legacy calculation.

The sweep must specifically check for reintroduction of period mixing, `workingDays` divisors, monthly BE formulas outside the authoritative owner, legacy target fields, projection-based target logic, and UI financial arithmetic.

### 4. Mutation propagation completeness

The current event path is confirmed for the major calculation sources, but the audit must explicitly verify every calculation-relevant mutation boundary, including maintenance, compliance, loans, loan payments, prepayments, driver targets, break-even inputs and backup restore.

## Non-negotiable final condition

No CI run is considered the audit itself. The next CI run occurs only after all 🟡 findings above are resolved and the pre-CI certificate can honestly be marked:

`PRE-CI CERTIFIED — NO KNOWN AUTHORITY / PERIOD / UNIT / ARCHITECTURE CONFLICTS`

Only then should the single full CI run be used as confirmation.
