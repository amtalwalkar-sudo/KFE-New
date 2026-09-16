# Driver Target Implementation Boundary

The frozen driver-target design is executable through an explicit invariant, but it does not authorize a newly invented recovery calculation.

## Authoritative interpretation

`Driver Target = current required target after applying the existing lifetime/rolling recovery balance`

The base requirement is:

`baseTarget = applicableBreakEvenCost + desiredDriverProfit`

The existing frozen lifetime/rolling recovery mechanism supplies the adjustment to that base requirement.

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

If the authoritative persisted rolling balance cannot be located, the implementation must expose the calculation as incomplete rather than fabricate one.
