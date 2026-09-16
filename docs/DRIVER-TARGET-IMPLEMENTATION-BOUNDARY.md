# Driver Target Implementation Boundary

The frozen driver-target design is executable through an explicit monthly obligation and dynamic remaining-day amortization. It does not authorize a newly invented recovery calculation.

## Authoritative interpretation

The target chain is:

`Monthly Break-even + Monthly Desired Driver Profit + Opening Rolling Balance = Effective Monthly Obligation`

`Effective Monthly Obligation − Target Already Allocated/Fulfilled = Remaining Obligation`

`Remaining Obligation / Remaining Eligible Calendar/Financial Target Days = Current Driver Target`

Monthly break-even is the single authoritative monthly business-calculation figure. Monthly desired driver profit is the amount the driver wants above that month's break-even. The opening rolling balance is the carried result from prior closed months. Daily break-even and daily Driver Target are derived representations; they are not independent business inputs.

For the active day:

`dailyBreakEven = monthlyBreakEven / remainingEligibleDays`

`currentDriverTarget = remainingEffectiveMonthlyObligation / remainingEligibleDays`

`driverTargetBase = (monthlyBreakEven + monthlyDesiredDriverProfit) / remainingEligibleDays`

`recoveryAdjustment = currentDriverTarget − driverTargetBase`

`remainingEligibleDays` is dynamic. It is not a fixed `workingDays` divisor.

## Calendar / financial-day semantics

- All calendar days are eligible by default.
- A day with a completed trip is a financial/target-bearing day.
- A day with no completed trip is a holiday/non-financial day and consumes no target allocation.
- A known holiday redistributes its untouched monthly obligation across later eligible days.
- The monthly obligation itself is never reduced because of holidays.
- The current day's target is derived from the remaining monthly obligation; actual current-month revenue does not immediately mutate that day's target or opening rolling balance.

Configured `workingDays` may remain in persisted compatibility/schema data, but it is not a competing divisor or target authority. Missing `workingDays` therefore does not make the monthly target unavailable.

The desired driver take-home/profit must be an explicit authoritative input on the applicable driver-target record (`desiredDriverProfit`, `desiredTakeHome`, or `desiredProfit`). Legacy/manual `targetRevenue`, `dailyTarget`, and `targetPerActiveDay` values are not authoritative.

If the authoritative desired-profit input or applicable monthly break-even requirement is unavailable, the driver-target calculation is unavailable rather than silently substituting an unrelated target value.

## Rolling recovery / surplus

The monthly state is explicit:

`openingBalance → monthlyVariance → closingBalance`

For a closed month:

`monthlyVariance = monthlyBaseTarget − actualMonthlyRevenue`

`closingBalance = openingBalance + monthlyVariance`

`openingBalance[next month] = closingBalance[previous month]`

Positive balance represents shortfall/recovery owed. Negative balance represents surplus carried forward.

The active month's variance is provisional and is not immediately added to today's opening balance. It becomes rolling state when the month closes.

## Target allocation

The current month's effective obligation is allocated dynamically. Earlier financial days consume their target allocation; holidays consume none. The current target is always computed from the remaining obligation divided by the remaining eligible days.

This preserves the full monthly obligation while allowing target guidance to rise after holidays or carried recovery without creating a second monthly authority.

## Actual calculations remain independent

Driver Target is informational/motivational only. Changing desired driver profit changes the displayed target and its rolling target state, but must not change actual revenue, vehicle/business/dead KM, fuel, maintenance, financing, renewal, cash, profit, or the authoritative monthly break-even calculation.

## Explicit non-rules

This clarification does not introduce:

- an N-day smoothing window;
- an arbitrary averaging period;
- a second monthly break-even authority;
- a second target calculation;
- a second recovery ledger;
- manual daily target authority;
- `workingDays` as a competing daily-target divisor;
- a reduction of monthly obligation for holidays.

The canonical data model already contains `break_even_inputs`; implementations must use its authoritative fields rather than inventing parallel break-even inputs.
