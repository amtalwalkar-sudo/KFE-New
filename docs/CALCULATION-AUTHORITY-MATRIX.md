# KFE Calculation Authority Matrix

**Audit phase:** Calculation & Data Authority Audit — phase 1
**Date:** 2026-09-17
**Calendar timezone:** IST / `Asia/Kolkata`
**Status:** Calculation-authority hardening implemented on branch `fix/calculation-authority-evidence`; the consolidated workflow includes contract tests, production PWA build, Capacitor Android sync, Android debug build, and Phase 10 hardening/release gate. Local Termux installation, Android build, and real-device runtime smoke testing remain external transfer-gate activities and are not represented as completed by this document.

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
EVIDENCE STATUS: AUTHORITATIVE | INDICATIVE | UNAVAILABLE
      ↓
DERIVED REPRESENTATIONS
      ↓
UI DISPLAY ONLY
```

Compatibility aliases are accepted at the normalization boundary only. Domain calculations must not interpret legacy field names.

## Evidence-state contract

Every derived business calculation that can be provisional must expose an explicit evidence state:

- **AUTHORITATIVE** — every required dependency is present and meets its qualification rule. This result may feed downstream authoritative calculations.
- **INDICATIVE** — a numerically useful result exists, but at least one required dependency is not yet qualified. It is display-only and must never feed an authoritative downstream result.
- **UNAVAILABLE** — required data is missing or invalid, so no useful result is produced.

The critical rule is: **an authoritative result may consume only authoritative dependencies**. A provisional/indicative input can produce an indicative result, but it cannot silently promote that result to authoritative.

For fuel, a qualified full-tank interval is authoritative. An observed-period spend/KM fallback is indicative. Therefore an observed-period fuel rate may produce an indicative break-even candidate, but it cannot produce an authoritative monthly break-even or authoritative Driver Target.


## Authority matrix

| Concept | Persisted source of truth | Canonical domain field/result | Calculation owner | Period/unit | UI rule |
|---|---|---|---|---|---|
| Revenue | `shifts.revenue` at shift completion | `revenue` | `authoritativeRevenue` / performance domain | ₹ / selected reporting period | Display only |
| Trip revenue detail | `trips.revenue` | supporting trip revenue detail | Trip/Ride repository | ₹ / trip | Never used as ERP revenue authority |
| Vehicle KM | `shifts.startOdometer/endOdometer` | `vehicleKm` | `performanceEngineV2` | km / selected reporting period | Display only |
| Business KM | completed `trips.tripKm` | `businessKm` | `performanceEngineV2` | km / selected reporting period | Display only |
| Dead KM | derived | `deadKm = vehicleKm - businessKm` | `performanceEngineV2` | km / selected reporting period | Display only |
| Fuel cost | `fuel_logs.amount` | `fuelCost` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Fuel quantity | `fuel_logs.quantityKg` | `fuelQty` | `performanceEngineV2` | kg / selected reporting period | Display only |
| Rolling fuel ₹/km | fuel-log history as-of boundary | `fuelCostPerKm` + evidence status | fuel calculation | ₹/km | Display status + value |
| Actual maintenance | `maintenance_records.cost` | `actualMaintenance` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Toll | `shifts.toll` | `toll` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Parking | `shifts.parking` | `parking` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Operating cost | actual cost components | `runningCost` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Operating profit | revenue − actual operating cost | `operatingProfit` | `performanceEngineV2` | ₹ / selected reporting period | Display only |
| Financing obligation | `loans` + schedule | `loanScheduledObligation` | loan calculation inside performance domain | ₹ / selected period | Display only |
| Actual financing outflow | `loan_payments` + applied `prepayments` | `actualFinancingOutflow` | loan calculation inside performance domain | ₹ / selected period | Display only |
| Renewal provision | `compliance_records` validity/cost | `renewalProvision` | renewal calculation inside performance domain | ₹ / selected period | Display only |
| **Monthly break-even** | `break_even_inputs` + canonical monthly cost inputs | `monthlyBreakEvenRevenue` + evidence status | `deriveAuthoritativeBreakEven` | ₹ / calendar month | Never recalculate in UI |
| Daily break-even allocation | authoritative monthly BE representation | `dailyBreakEvenRevenue` / `dailyBreakEven.total` + evidence status | performance service | ₹ / remaining eligible financial day | Representation only; never a second formula/authority |
| Monthly desired driver profit | `driver_targets.desiredDriverProfit` | `monthlyDesiredDriverProfit` | Driver Target domain | ₹ / calendar month | Never reinterpret as daily authority |
| Opening rolling balance | prior closed month's closing state | `openingBalance` | Driver Target domain | ₹ / month | Display only |
| Monthly variance | monthly base target − actual monthly revenue | `monthlyVariance` | Driver Target domain | ₹ / month | Display only |
| Closing rolling balance | opening balance + monthly variance | `closingBalance` | Driver Target domain | ₹ / month | Display only |
| Effective monthly obligation | monthly BE + desired profit + opening balance | `effectiveMonthlyTarget` | Driver Target domain | ₹ / month | Display only |
| Remaining obligation | effective monthly obligation − target allocated before current day | `remainingObligation` | Driver Target domain | ₹ / month remaining | Display only |
| Remaining eligible days | calendar days minus known holidays/off days | `remainingEligibleDays` | Driver Target domain | days | Display only |
| Current Driver Target | remaining obligation ÷ remaining eligible days | `currentDailyTarget` / service `target` + evidence status | Driver Target domain | ₹ / financial day | UI may display only |
| Current pace | actual revenue ÷ completed-trip financial days | `revenuePerActiveDay` / service pace | performance domain | ₹ / financial day | Display only |
| Pace variance | actual pace − current Driver Target | `paceVariance` | performance service | ₹ / financial day | Display only |
| Projection | **Not an authority and not required for Driver Target** | removed from target/pace contract | none | n/a | Do not display as target logic |

**Authority identifier:** `SHIFT_END_REVENUE` is the canonical ownership marker for operational revenue. `AUTHORITATIVE_MONTHLY_BREAK_EVEN` remains the ownership marker for monthly break-even.

## Period rules

- Actual economics remain tied to the selected reporting range.
- Break-even is always a **calendar-month authority**. A selected reporting range does not create a competing break-even authority.
- The open/current month is evaluated through the calculation as-of boundary, capped at the selected end timestamp so future observations cannot leak into a historical/current-day calculation.
- Closed months use the complete IST calendar month.
- Driver Target is a monthly obligation represented as a dynamic daily amount.
- A financial/target-bearing day requires at least one completed trip. Shift start alone does not create or consume a target-bearing day.
- A day without a completed trip consumes no target allocation.
- Holidays/off days therefore redistribute untouched obligation over remaining eligible days.
- Current-month actual revenue does not immediately change today's Driver Target; active-month variance remains provisional until month close.
- The daily break-even value is only an allocation/representation of authoritative monthly break-even over the remaining eligible financial days. It is not a second daily cost-build formula.
- The Driver Target is separate: it adds monthly desired driver profit and the rolling balance mechanism to the authoritative monthly break-even, then allocates the remaining obligation over eligible financial days.

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

This revision deliberately removes duplicate break-even orchestration from `performanceEngineV2`. `financePerformanceAdapter` is the sole application-facing orchestrator that combines canonical finance inputs with `deriveAuthoritativeBreakEven`. The base engine supplies operational observations and fuel evidence only; it does not create a second break-even authority.


This artifact is the working source for the authority audit. It records repository-level CI verification as completed while explicitly leaving local Termux/device execution outside the GitHub-side claim. It must be updated whenever code/specification findings change the ownership, period, unit, or canonical field of a calculation.
