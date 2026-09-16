# Driver Target Authoritative Audit — 2026-09-16

## CI

The post-merge CI for `main` commit `0f03cdd0bbd2458906c557a8bd1fea6898d6de60` was reported green after the Driver Target stabilization merge.

The standard `npm test` script includes both the structural stabilization contract and the implementation contract.

## Audit findings

### 1. Driver target input authority

The frozen rule requires:

`baseTarget = applicableBreakEvenCost + desiredDriverProfit`

The implementation now requires an explicit `desiredDriverProfit`, `desiredTakeHome`, or `desiredProfit` field when deriving a target from break-even. A legacy `targetRevenue` value is no longer accepted by the stabilization implementation as a substitute for desired take-home/profit.

If the authoritative desired-profit input is missing, the stabilization result is explicitly unavailable rather than silently falling back to an unrelated target field.

### 2. Driver Target is informational and does not alter actual calculations

The Driver Target is a driver-facing motivation and situational-awareness value. It is not an input to the underlying actual business calculations and must never modify actual revenue, cost, break-even, profit, or other authoritative financial calculations.

The displayed Driver Target must always be derived from the authoritative Driver Target chain:

`applicable break-even requirement + Admin-defined desired driver profit + rolling recovery/surplus adjustment`

An explicitly stored `dailyTarget` or `targetPerActiveDay` must not override or replace that derivation. Legacy target fields such as `targetRevenue`, `target`, or `amount` must not become alternate authorities for the displayed Driver Target.

If the authoritative break-even requirement or desired driver profit is unavailable, the Driver Target is unavailable rather than falling back to a manually stored target.

The rolling recovery/surplus adjustment affects only the displayed Driver Target. It does not feed back into or change the actual calculation layer.

### 3. Break-even source

The canonical IndexedDB schema contains `break_even_inputs`, and the performance repository already reads that store. The current performance engine has a legacy path that does not yet consume that snapshot collection directly for all break-even inputs. This is retained as an explicit follow-up boundary rather than silently inventing a new mapping.

### 4. Rolling recovery

Repository audit did not identify a separate persisted rolling-recovery balance store. The current stabilization reconstructs the carried balance from authoritative completed-trip revenue and shift-defined active days. This is reconstructable from authoritative records and uses no N-day smoothing window, but it must continue to be treated as the implementation of the frozen rolling mechanism, not as a second business ledger.

### 5. Active/off-day behavior

Active days are derived from shifts. A shift day participates even when it has zero completed trips. A day without a shift does not create a driver target or recovery increment.

### 6. Calculation chain

The current chain is:

`completed trips + shifts + driver target inputs → break-even → base driver requirement → carried rolling adjustment → current active-day driver target → pace requirement`

The stabilized target is wired through `PerformanceService` into the pace calculation.

## Regression boundary

The contracts cover:

- exact active-day target;
- below-target recovery;
- recovery absorption by above-target performance;
- surplus carry-forward;
- off-day behavior;
- active shift with zero revenue;
- missing authoritative desired-profit input;
- service-level target wiring.

No N-day averaging or arbitrary smoothing window is introduced.
