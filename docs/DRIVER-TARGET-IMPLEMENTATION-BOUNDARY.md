# Driver Target Implementation Boundary

The frozen driver-target design is executable through an explicit invariant, but it does not authorize a newly invented recovery calculation.

## Authoritative interpretation

`Driver Target = current required target after applying the existing lifetime/rolling recovery balance`

The base requirement is:

`baseTarget = applicableBreakEvenCost + desiredDriverProfit`

For the displayed active-day Driver Target, both terms are active-day amounts: the applicable break-even requirement is resolved for the active day, and `desiredDriverProfit` is the administrator-defined desired profit for that active day. There is no additional division by `workingDays`, `activeWorkingDays`, `targetWorkingDays`, or an arbitrary period length.

The desired driver take-home/profit must be an explicit authoritative input on the applicable driver-target record (`desiredDriverProfit`, `desiredTakeHome`, or `desiredProfit`). A legacy `targetRevenue` value must not be interpreted as the desired profit input. Legacy/manual `dailyTarget` and `targetPerActiveDay` values are not authoritative.

If the authoritative desired-profit input or applicable break-even requirement is unavailable, the driver-target calculation is unavailable rather than silently substituting an unrelated target value.

The rolling recovery/surplus adjustment is reconstructed from authoritative historical completed-trip revenue and shift-defined active days. This reconstruction must remain the implementation of the frozen rolling mechanism and must not become a second business ledger.

When historical active days are part of the reconstruction, their authoritative base requirement must also be available. Historical break-even reconstruction must be day-scoped and must use only information available by that historical day; future fuel observations or other future-dated calculation inputs must not leak backward into the historical balance.

## Day participation

- Active working days participate in the rolling balance.
- Inactive/off days have no driver target.
- Inactive/off days do not increase recovery.
- Below-target active performance reinforces recovery.
- Above-target active performance reduces outstanding recovery or creates surplus.
- The carried balance affects subsequent active-day targets progressively.
- `workingDays` on a Driver Target record is descriptive period metadata; it is not a divisor or alternate target authority.

## Actual calculations remain independent

Driver Target is informational/motivational only. Changing `desiredDriverProfit` changes the displayed target and its rolling target adjustment, but must not change actual revenue, vehicle/business/dead KM, fuel, maintenance, financing, renewal, cash, profit, or authoritative break-even calculations.

## Explicit non-rules

This clarification does not introduce:

- an N-day smoothing window;
- an arbitrary averaging period;
- a second target calculation;
- a second recovery ledger;
- a replacement for the existing frozen rolling balance.

The canonical data model already contains `break_even_inputs`; implementations must use its authoritative fields rather than inventing parallel break-even inputs.
