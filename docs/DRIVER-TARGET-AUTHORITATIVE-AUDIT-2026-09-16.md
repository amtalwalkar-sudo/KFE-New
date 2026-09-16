# Driver Target Authoritative Audit — 2026-09-16

## CI baseline

The post-merge CI for `main` commit `2cde14ba55ec99dda3aadd5029945fc3d07ebda9` completed successfully as workflow run #160 (`KFE 2.0 single CI`). That baseline build-and-test job completed the configured foundation contract tests, production PWA build, Capacitor Android sync, and Android debug APK build successfully.

The current hardening branch has additional changes after that baseline. Current branch CI must be green again before merge.

## Audit findings

### 1. Driver Target input authority and normalization

The authoritative persisted Driver Target input is `desiredDriverProfit`.

Persisted compatibility variants such as `desiredTakeHome`, `desiredProfit`, snake_case field names, and other legacy aliases are resolved once at the application normalization boundary. The canonical Driver Target domain object exposes `desiredDriverProfit`; the Driver Target domain does not interpret those legacy names.

An explicitly stored `dailyTarget` or `targetPerActiveDay` is not an authority. A legacy `targetRevenue`, `target`, or unrelated `amount` field cannot substitute for desired driver profit.

The Admin Driver Target form requires the authoritative desired-profit input. If the canonical desired-profit input is unavailable after normalization, the Driver Target result is unavailable rather than silently falling back to another field.

### 2. Driver Target is informational and does not alter actual calculations

Driver Target is a driver-facing motivation and situational-awareness value. It is not an input to actual business economics and must never modify actual revenue, KM, fuel, cost, break-even, profit, cash, financing, or renewal calculations.

The authoritative target chain is:

`monthlyBreakEvenRevenue + monthlyDesiredDriverProfit + openingRollingBalance → effectiveMonthlyObligation → remainingObligation → currentDailyTarget`

The current daily target is amortized over the remaining eligible financial/calendar days. The denominator changes as financial days and known holidays are established.

### 3. Monthly break-even is the sole break-even authority

The canonical IndexedDB schema contains `break_even_inputs`, and the performance repository reads that store directly.

`deriveAuthoritativeBreakEven()` produces the canonical result:

`monthlyBreakEvenRevenue`

The selected reporting range does not create a second period-level break-even authority. Daily break-even is only a representation of the monthly authority.

### 4. Rolling recovery

No separate persisted rolling-recovery balance store is used.

The current stabilization reconstructs rolling state from authoritative monthly Driver Target requirements and actual completed-trip revenue:

`openingBalance → monthlyVariance → closingBalance → next month's openingBalance`

Only closed-month variance is carried into the next month. Active-month variance is provisional.

No N-day smoothing window or replacement recovery ledger is introduced.

### 5. Financial-day and holiday behavior

A day becomes a financial/target-bearing day only when it contains at least one completed trip.

A shift without a completed trip is an actual operational record but does not manufacture a Driver Target day.

A day without a completed trip consumes no target allocation. Its untouched monthly obligation remains for later eligible financial days.

The same financial-day/holiday rule is used by both daily break-even representation and Driver Target amortization.

### 6. Daily target and pace units

Monthly values remain monthly values. Daily values are derived representations.

`dailyBreakEvenRevenue = monthlyBreakEvenRevenue / remainingEligibleDays`

`currentDailyTarget = remainingObligation / remainingEligibleDays`

Pace compares like-for-like units only:

`currentRevenuePerFinancialDay - currentDailyTarget`

The previous period-mixed projection/target-gap calculation is not part of the target authority and has been removed from the performance contract/UI.

### 7. Timezone and calendar boundary

KFE calendar classification uses IST / `Asia/Kolkata` regardless of device/browser timezone.

This applies to day, week, month, open/current-month, closed-month, financial-day, and holiday boundaries.

### 8. Data-boundary and integrity audit

Persisted schema variants are normalized before domain calculations. The domain calculation layer consumes canonical names only.

Records use client-generated UUIDs. Source-record deletion is implemented as soft deletion so historical records remain available to audit/recovery while being excluded from calculations.

Future operational records and future fuel records must not leak into an earlier reporting/as-of calculation.

### 9. Live calculation consumption

The Performance UI consumes a snapshot from the Performance Repository. Canonical mutations notify the application so the Performance snapshot is refreshed and computed metrics update.

Current notification coverage includes canonical Admin writes, shift/trip writes, fuel writes, and backup restore. Additional repository mutation paths remain part of the later full Gate 10 audit.

## Regression boundary

The contracts cover or are being extended to protect:

- normalization equivalence between persisted variants and canonical records;
- canonical monthly break-even output;
- dynamic remaining eligible-day target allocation;
- financial-day/holiday behavior;
- rolling deficit/surplus state;
- Driver Target invariance against actual economics;
- historical as-of-day fuel isolation;
- future operational-record isolation;
- soft-delete exclusion;
- malformed authoritative finance records;
- client-generated ID uniqueness;
- IST calendar boundaries;
- no projection/period-mixed target-gap authority.

This document is subordinate to the frozen KFE calculation semantics and must be updated when the implementation changes a source, owner, unit, period, or authority.
