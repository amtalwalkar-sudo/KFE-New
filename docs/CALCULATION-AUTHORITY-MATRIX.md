# KFE Calculation Authority Matrix

**Audit phase:** Calculation & Data Authority Audit — phase 1
**Date:** 2026-09-16
**Calendar timezone:** IST / `Asia/Kolkata`
**Status:** In progress; Gate 10 is intentionally deferred.

## Non-negotiable architecture

```text
Persisted variants
      ↓
NORMALIZATION
      ↓
CANONICAL DOMAIN OBJECT
      ↓
DOMAIN KNOWS ONLY CANONICAL NAMES
      ↓
ONE OWNER PER BUSINESS CALCULATION
      ↓
ONE AUTHORITATIVE RESULT PER CONCEPT
      ↓
DERIVED REPRESENTATIONS
      ↓
UI DISPLAY ONLY
```

Compatibility aliases are accepted at the normalization boundary only. Domain calculations must not interpret legacy field names.

## Authority matrix

| Concept | Persisted source of truth | Canonical domain field/result | Calculation owner | Period/unit | UI rule |
|---|---|---|---|---|---|
| Revenue | `trips` | `revenue` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Vehicle KM | `shifts.startOdometer/endOdometer` | `vehicleKm` | `performanceEngineV2` | km / selected reporting period | Display only |
| Business KM | completed `trips.tripKm` | `businessKm` | `performanceEngineV2` | km / selected reporting period | Display only |
| Dead KM | derived | `deadKm = vehicleKm - businessKm` | `performanceEngineV2` | km / selected reporting period | Display only |
| Fuel cost | `fuel_logs.amount` | `fuelCost` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Fuel quantity | `fuel_logs.quantityKg` | `fuelQty` | `performanceEngineV2` | kg / selected reporting period | Display only |
| Rolling fuel ₹/km | fuel-log history as-of boundary | `fuelCostPerKm` | fuel calculation | ₹/km | Display only |
| Actual maintenance | `maintenance_records.cost` | `actualMaintenance` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Toll | `shifts.toll` | `toll` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Parking | `shifts.parking` | `parking` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Operating cost | actual cost components | `runningCost` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Operating profit | revenue − actual operating cost | `operatingProfit` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Financing obligation | `loans` + schedule | `loanScheduledObligation` | loan calculation inside performance domain | ₹ / selected period | Display only |
| Actual financing outflow | `loan_payments` + applied `prepayments` | `actualFinancingOutflow` | loan calculation inside performance domain | ₹ / selected period | Display only |
| Renewal provision | `compliance_records` validity/cost | `renewalProvision` | renewal calculation inside performance domain | ₹ / selected period | Display only |
| Monthly break-even | `break_even_inputs` + canonical monthly cost inputs | `monthlyBreakEvenRevenue` | `deriveAuthoritativeBreakEven` | ₹ / calendar month | Never recalculate in UI |
| Daily break-even | monthly BE representation | `dailyBreakEvenRevenue` | application/service derivation | ₹ / remaining eligible financial day | Never persisted as authority |
| Monthly desired driver profit | `driver_targets.desiredDriverProfit` | `monthlyDesiredDriverProfit` | Driver Target domain | ₹ / calendar month | Never reinterpret as daily authority |
| Opening rolling balance | prior closed month's closing state | `openingBalance` | Driver Target domain | ₹ / month | Display only |
| Monthly variance | monthly base target − actual monthly revenue | `monthlyVariance` | Driver Target domain | ₹ / month | Display only |
| Closing rolling balance | opening balance + monthly variance | `closingBalance` | Driver Target domain | ₹ / month | Display only |
| Effective monthly obligation | monthly BE + desired profit + opening balance | `effectiveMonthlyTarget` | Driver Target domain | ₹ / month | Display only |
| Remaining obligation | effective monthly obligation − target allocated before current day | `remainingObligation` | Driver Target domain | ₹ / month remaining | Display only |
| Remaining eligible days | calendar days minus known holidays/off days | `remainingEligibleDays` | Driver Target domain | days | Display only |
| Current Driver Target | remaining obligation ÷ remaining eligible days | `currentDailyTarget` / service `target` | Driver Target domain | ₹ / financial day | UI may display only |
| Current pace | actual revenue ÷ completed-trip financial days | `revenuePerActiveDay` / service pace | performance domain | ₹ / financial day | Display only |
| Pace variance | actual pace − current Driver Target | `paceVariance` | performance service | ₹ / financial day | Display only |
| Projection | **Not an authority and not required for Driver Target** | removed from target/pace contract | none | n/a | Do not display as target logic |

## Period rules

- Actual economics remain tied to the selected reporting range.
- Break-even is always a **calendar-month authority**. A selected reporting range does not create a competing break-even authority.
- Open/current month is evaluated through the current IST calendar day end.
- Closed months use the complete IST calendar month.
- Driver Target is a monthly obligation represented as a dynamic daily amount.
- A financial/target-bearing day requires at least one completed trip.
- A day without a completed trip consumes no target allocation.
- Holidays/off days therefore redistribute untouched obligation over remaining eligible days.
- Current-month actual revenue does not immediately change today's Driver Target; active-month variance remains provisional until month close.

## Unit rules

Never compare or subtract values with different units/periods without an explicit conversion.

Examples:

```text
₹ / financial day  ↔  ₹ / financial day     allowed
₹ / month          ↔  ₹ / month             allowed
₹ / month          ↔  ₹ / financial day    NOT directly comparable
₹ / selected period ↔ ₹ / month             NOT directly comparable
```

## UI boundary

Presentation code must consume service/domain outputs. It may format, label, navigate, and present values, but must not reproduce business formulas or introduce alternative authorities.

## Data freshness contract

```text
Canonical DB mutation
      ↓
canonical-data-changed notification
      ↓
Performance snapshot refresh
      ↓
computed metrics recompute
      ↓
UI updates
```

This invalidation path is implemented for the current canonical admin, shift/trip, fuel, and backup-restore mutation boundaries. The broader repository mutation surface remains part of the later full audit.

## Audit status

This artifact is the working source for the authority audit. It must be updated whenever code/specification findings change the ownership, period, unit, or canonical field of a calculation.
