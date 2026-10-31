# Performance Foundation

**Status:** SUPPORTING — subordinate to `KFE_BUSINESS_RULES_REGISTER.md`.

## Scope

This document describes the supporting read architecture and presentation boundary for the basic read-only Performance screen. It is not a business-rule or calculation authority.

## Ownership

- Read saved canonical records through `PerformanceRepository`.
- `PhaseOnePerformanceService` coordinates the reporting range, canonical snapshot, and fuel summary.
- Domain projection logic derives the view model; the Vue view only presents it.
- Performance subscribes to canonical changes affecting shifts, trips, fuel logs, and business settings. Notifications received during a read are coalesced into one follow-up snapshot.
- Keep Performance read-only. It must not mutate rides, shifts, fuel records, or Admin forms.
- Timeline and Performance may share saved source facts but do not own a second persistence authority.
- The sole business authority for supported metrics, formulas, and reporting-period attribution is `KFE_BUSINESS_RULES_REGISTER.md`.

## Exclusions

No targets, forecasts, break-even models, provisions, profitability projections, loan amortization, maintenance projections, or other derived financial models belong in the current Performance screen.
