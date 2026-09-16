# Driver Target Implementation Boundary

The frozen driver-target design is executable through an explicit invariant, but it does not authorize a newly invented recovery calculation.

## Authoritative interpretation

`Driver Target = current required target after applying the existing lifetime/rolling recovery balance`

The authoritative hierarchy is:

`Monthly Break-even → Monthly Desired Driver Profit → Effective Monthly Driver Target → Daily derived figures`

For a target period with `workingDays` active working days:

`dailyBreakEven = monthlyBreakEven / workingDays`

`dailyDesiredDriverProfit = monthlyDesiredDriverProfit / workingDays`

`baseDailyTarget = dailyBreakEven + dailyDesiredDriverProfit`

`activeDayTarget = baseDailyTarget + recoveryAdjustment`

Monthly break-even is the authoritative business-calculation figure for that month. Monthly desired driver profit is the amount the driver wants above that month's break-even. Daily break-even and daily Driver Target are derived values; they are not independent business inputs.

`workingDays` is therefore a required unit-conversion input for the monthly Driver Target record. It is not an alternate target authority and does not replace the monthly figures.

The desired driver take-home/profit must be an explicit authoritative input on the applicable driver-target record (`desiredDriverProfit`, `desiredTakeHome`, or `desiredProfit`). Legacy/manual `targetRevenue`, `dailyTarget`, and `targetPerActiveDay` values are not authoritative.

If the authoritative desired-profit input, working-day count, or applicable monthly break-even requirement is unavailable, the driver-target calculation is unavailable rather than silently substituting an unrelated target value.

## Rolling recovery / surplus

The monthly target is compared with actual monthly revenue and the resulting shortfall/surplus rolls forward into the next month. The carried balance is then applied to future active-day targets through the existing frozen recovery mechanism.

Conceptually:

`monthlyActualRevenue − (monthlyBreakEven + monthlyDesiredDriverProfit) → surplus/shortfall → rolling balance → next month's effective target`

The implementation must preserve the existing sign convention and auditable balance transition. It must not introduce an N-day smoothing window, arbitrary averaging period, or replacement recovery ledger.

Historical active days used to reconstruct the carried balance must have an authoritative monthly base requirement. If that historical monthly requirement cannot be resolved, the rolling calculation is incomplete rather than silently starting the balance at zero.

## Day participation

- Active working days participate in the rolling balance.
- Inactive/off days have no driver target.
- Inactive/off days do not increase recovery.
- A below-target active day creates/reinforces recovery.
- An above-target active day reduces outstanding recovery or creates surplus.
- The carried balance affects subsequent active-day targets progressively.

## Actual calculations remain independent

Driver Target is informational/motivational only. Changing desired driver profit changes the displayed target and its rolling target adjustment, but must not change actual revenue, vehicle/business/dead KM, fuel, maintenance, financing, renewal, cash, profit, or the authoritative monthly break-even calculation.

## Explicit non-rules

This clarification does not introduce:

- an N-day smoothing window;
- an arbitrary averaging period;
- a second target calculation;
- a second recovery ledger;
- manual daily target authority;
- a replacement for the existing frozen rolling balance.

The canonical data model already contains `break_even_inputs`; implementations must use its authoritative fields rather than inventing parallel break-even inputs.
