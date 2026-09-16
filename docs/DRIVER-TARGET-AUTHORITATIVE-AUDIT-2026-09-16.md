# Driver Target Authoritative Audit — 2026-09-16

## CI

The post-merge CI for `main` commit `2cde14ba55ec99dda3aadd5029945fc3d07ebda9` completed successfully as workflow run #160 (`KFE 2.0 single CI`). The build-and-test job completed all configured foundation contract tests, production PWA build, Capacitor Android sync, and Android debug APK build successfully.

The standard `npm test` script includes both the structural stabilization contract and the implementation contract, plus the calculation-boundary adversarial contract.

## Audit findings

### 1. Driver target input authority

The frozen rule requires:

`baseTarget = applicableBreakEvenCost + desiredDriverProfit`

The implementation now requires an explicit `desiredDriverProfit`, `desiredTakeHome`, or `desiredProfit` field when deriving a target from break-even. A legacy `targetRevenue` value is no longer accepted by the stabilization implementation as a substitute for desired take-home/profit.

The Admin Driver Target form now also marks `desiredDriverProfit` as required, so the authoritative input cannot be omitted silently at the form boundary.

If the authoritative desired-profit input is missing, the stabilization result is explicitly unavailable rather than silently falling back to an unrelated target field.

### 2. Driver Target is informational and does not alter actual calculations

The Driver Target is a driver-facing motivation and situational-awareness value. It is not an input to the underlying actual business calculations and must never modify actual revenue, cost, break-even, profit, or other authoritative financial calculations.

The displayed Driver Target must always be derived from the authoritative Driver Target chain:

`applicable break-even requirement + Admin-defined desired driver profit + rolling recovery/surplus adjustment`

An explicitly stored `dailyTarget` or `targetPerActiveDay` must not override or replace that derivation. Legacy target fields such as `targetRevenue`, `target`, or `amount` must not become alternate authorities for the displayed Driver Target.

If the authoritative break-even requirement or desired driver profit is unavailable, the Driver Target is unavailable rather than falling back to a manually stored target.

The rolling recovery/surplus adjustment affects only the displayed Driver Target. It does not feed back into or change the actual calculation layer.

### 3. Break-even source

The canonical IndexedDB schema contains `break_even_inputs`, and the performance repository reads that store directly. The performance service passes those authoritative inputs through the calculation boundary and re-derives break-even from canonical performance costs.

### 4. Rolling recovery

Repository audit did not identify a separate persisted rolling-recovery balance store. The current stabilization reconstructs the carried balance from authoritative completed-trip revenue and shift-defined active days. This is reconstructable from authoritative records and uses no N-day smoothing window, but it must continue to be treated as the implementation of the frozen rolling mechanism, not as a second business ledger.

### 5. Active/off-day behavior

Active days are derived from shifts inside the Driver Target stabilization service. A shift day participates even when it has zero completed trips. A day without a shift does not create a driver target or recovery increment.

The existing performance-period `activeFinancialDays` metric remains a separate revenue/activity metric derived from completed trips; it must not be silently substituted for Driver Target stabilization's shift-defined active-day authority.

### 6. Calculation chain

The current chain is:

`completed trips + shifts + driver target inputs → break-even → base driver requirement → carried rolling adjustment → current active-day driver target → pace requirement`

The stabilized target is wired through `PerformanceService` into the pace calculation.

### 7. Data-boundary and integrity audit

The calculation boundary normalizes persisted loan schema variants (`tenureYears`/`tenureMonths`, alternate start-date and rate field names) before the canonical engine. The ERP form contract covers authoritative source fields. Records use client-generated UUIDs, and source-record deletion is implemented as soft deletion so historical records remain available to audit/recovery while being excluded from calculations.

An adversarial regression contract now protects the following boundaries: empty/partial data, future-record leakage into historical calculations, soft-deleted records, active shift with zero completed trips, malformed loan data, and UUID uniqueness.

## Regression boundary

The contracts cover:

- exact active-day target;
- below-target recovery;
- recovery absorption by above-target performance;
- surplus carry-forward;
- off-day behavior;
- active shift with zero revenue;
- missing authoritative desired-profit input;
- service-level target wiring;
- Driver Target invariance against actual economics;
- historical as-of-day fuel isolation;
- future operational-record isolation;
- soft-delete exclusion;
- malformed authoritative finance records;
- client-generated ID uniqueness.

No N-day averaging or arbitrary smoothing window is introduced.
