# Performance Foundation

**Scope:** This document covers only the basic read-only Performance screen.

## Supported summary

- Recorded revenue from completed ride fares plus saved cancellation fees.
- Completed ride count.
- Recorded fuel spending, including partial refills.
- Fuel cost/km from consecutive valid full-tank odometer readings only.
- Income after fuel = recorded revenue − recorded fuel spending.

## Exclusions

No targets, forecasts, break-even models, provisions, profitability projections, loan amortization, maintenance projections, or other derived financial models.

## Ownership

- Read saved canonical records through `PerformanceRepository`.
- Keep calculation logic in the application/domain layer, not in the view.
- Performance is read-only and must not mutate rides, shifts, fuel records, or Admin forms.
- Timeline and Performance may share saved source facts but do not own a second persistence authority.
- Any new calculation requires an explicit user request and an update to the business-rule register first.
