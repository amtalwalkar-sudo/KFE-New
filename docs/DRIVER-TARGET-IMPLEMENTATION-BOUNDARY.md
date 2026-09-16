# Driver Target Implementation Boundary

The frozen driver-target design is executable through an explicit invariant, but it does not authorize a newly invented recovery calculation.

## Authoritative interpretation

`Driver Target = current required target after applying the existing lifetime/rolling recovery balance`

The base requirement is:

`baseTarget = applicableBreakEvenCost + desiredDriverProfit`

The desired driver take-home/profit must be an explicit authoritative input on the applicable driver-target record (`desiredDriverProfit`, `desiredTakeHome`, or `desiredProfit`). A legacy `targetRevenue` value must not be interpreted as the desired profit input.

If the authoritative desired-profit input or applicable break-even requirement is unavailable, the driver-target calculation is unavailable rather than silently substituting an unrelated target value.

The rolling recovery/surplus adjustment is reconstructed from authoritative historical completed-trip revenue and shift-defined active days. This reconstruction must remain the implementation of the frozen rolling mechanism and must not become a second business ledger.

When historical active days are part of the reconstruction, their authoritative base requirement must also be available. If the historical applicable break-even requirement cannot be resolved, the rolling balance is incomplete and the current Driver Target must be exposed as unavailable rather than silently starting the balance at zero.

## Day participation

- Active working days participate in the rolling balance.
- Inactive/off days have no driver target.
- Inactive/off days do not increase recovery.
- Below-target active performance reinforces recovery.
- Above-target active performance reduces outstanding recovery or creates surplus.
- The carried balance affects subsequent active-day targets progressively.

## Explicit non-rules

This clarification does not introduce:

- an N-day smoothing window;
- an arbitrary averaging period;
- a second target calculation;
- a second recovery ledger;
- a replacement for the existing frozen rolling balance.

The canonical data model already contains `break_even_inputs`; implementations must use its authoritative fields rather than inventing parallel break-even inputs.
