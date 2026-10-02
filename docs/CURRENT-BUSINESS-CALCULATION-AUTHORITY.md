# Current Business Calculation Authority

This file is the active calculation map for KFE. Runtime business calculations must use these authorities only.

## Operating KM forecast
- Prior: 200 km per calendar day.
- Evidence: completed-shift odometer delta.
- Response: 10% baseline to 30% maximum with 5-day same-direction persistence.
- Robustness: individual deviation clipped to ±75 km/day.
- Monthly/full-period KM: observed KM to date + learned daily forecast × remaining calendar days.

## Break-even
- Monthly break-even is authoritative only when its required evidence is complete.
- KM basis: calculated operating-KM forecast.
- Dynamic cost: forecast KM × (fuel cost/km + maintenance provision/km).
- Fixed cost: scheduled EMI obligation + pre-business loan recovery + historical maintenance recovery + compliance provision.
- Formula: monthly break-even = fixed cost + dynamic cost.

## Driver target
- Monthly target requirement = authoritative monthly break-even + Admin desired monthly driver profit.
- Daily target = monthly target requirement ÷ calendar days in the target month.
- Driver target is unavailable when authoritative break-even or the Admin desired monthly driver profit is unavailable.

## Daily revenue reservation
- Today's revenue is reserved proportionally against the current monthly modeled obligations.
- Buckets: financial obligation, maintenance provision, compliance provision, and separately tracked required recovery where applicable.
- This reservation view does not replace provision accrual or actual payment accounting.

## Profit
- Actual P/L = financial revenue − actual operating expenses − scheduled EMI for the selected period.
- Provisional P/L = Actual P/L − maintenance provision − compliance provision − pre-business loan recovery − historical maintenance recovery.

## Authority boundary
- Calculation engines own business formulas.
- Services compose authoritative results.
- Presentation consumes calculated results and does not recreate financial formulas.
- Completed-shift odometer evidence remains the operating-KM authority.
- Business Start Date bounds financial reporting from its configured IST date.
