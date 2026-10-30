# KFE Calculation Specification

**Status:** Authoritative for the limited current Performance summary.

The current product does not include a general financial model. This specification covers only the small set of calculations needed by the basic Performance screen. Business meaning and product boundaries are defined in `KFE_BUSINESS_RULES_REGISTER.md`.

## Supported calculations

### Recorded revenue

Recorded revenue is the sum of saved fares for completed rides plus saved cancellation fees. A cancellation fee remains a cancellation outcome and is not a completed-ride fare. A missing cancellation fee contributes zero.

### Fuel spending

Fuel spending is the sum of recorded refill amounts in the selected period. Partial refills are included in spending.

### Fuel cost per kilometre

Use consecutive valid full-tank odometer readings to form mileage intervals. A partial refill contributes to fuel spending but does not establish an interval. Do not invent an interval when required readings are missing, invalid, or not explicitly marked full-tank.

### Income after fuel

`incomeAfterFuel = recordedRevenue - recordedFuelSpending`

Recorded revenue includes saved cancellation fees. This is a simple recorded-data summary, not a forecast or full profitability model.

## Explicitly out of scope

The current product must not implement or display forecasts, targets, break-even, provisions, profit/loss models, loan amortization, prepayment estimates, maintenance projections, compliance provisions, recovery balances, or other derived financial models.

Do not create substitute calculations to replace retired models. Preserve underlying saved business records unless the user explicitly requests a data change.

## Implementation boundary

- Calculation logic belongs in the application/domain layer, not duplicated in views.
- Use saved authoritative records only; never fabricate missing inputs.
- Timeline remains read-only and does not own business calculations.
- Add new calculations only after an explicit user request.
