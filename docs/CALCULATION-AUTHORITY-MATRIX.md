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

For fuel, a qualified full-tank interval is authoritative only when the fuel record has explicit `isFullTank === true`, a valid timestamp, valid non-negative odometer, positive amount, and a stable `vehicleId` shared by both endpoints of the interval. An observed-period spend/KM fallback is indicative. Therefore an observed-period fuel rate may produce an indicative break-even candidate, but it cannot produce an authoritative monthly break-even or authoritative Driver Target. Missing full-tank confirmation or vehicle association never silently qualifies a record.


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
| Financing obligation | `loans` + schedule | `loanScheduledObligation` | canonical `loanEngine` via `financePerformanceAdapter` | ₹ / selected period | Display only |
| Actual financing outflow | `loan_payments` + applied `prepayments` | `actualFinancingOutflow` | canonical `loanEngine` via `financePerformanceAdapter` | ₹ / selected period | Display only |
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
| Actual revenue fact | `shifts.revenue` at completed shift | `REVENUE / ACTUAL` | `financialFactModel` | ₹ / selected period | Never reinterpret as cash without settlement evidence |
| Actual operating expense facts | fuel logs, shift toll/parking, maintenance records | `ACTUAL EXPENSE` | `financialFactModel` | ₹ / selected period | Expense is not automatically cash |
| Financing obligation fact | canonical loan schedule | `FINANCING_OBLIGATION / OBLIGATION` | `loanEngine` mapped by `financialFactModel` | ₹ / selected period | Never treat obligation as payment |
| Financing payment fact | loan payments + applied prepayments | `FINANCING_PAYMENT / ACTUAL` | `loanEngine` mapped by `financialFactModel` | ₹ / selected period | Cash settlement evidence |
| Maintenance provision | authoritative break-even maintenance provision | `MAINTENANCE_PROVISION / PROVISION` | `authoritativeBreakEven` mapped by `financialFactModel` | ₹ / selected period | Never treat provision as actual expense |
| Renewal provision | compliance validity/cost | `RENEWAL_PROVISION / PROVISION` | `performanceEngineV2` mapped by `financialFactModel` | ₹ / selected period | Reserve/provision only until settlement |
| Actual-vs-provision variance | actual maintenance / explicit renewal settlement vs provision | `ACTUAL_VS_PROVISION_VARIANCE` | `financialFactModel` | ₹ / selected period | Signed variance is explanatory, not a new expense |
| Capex fact | vehicle acquisition value | `CAPEX / ACTUAL` | `financialFactModel` | ₹ / acquisition period | Acquisition record does not prove cash settlement |
| Receivable position | explicit receivable settlement/position records | `RECEIVABLE` | `financialFactModel` | ₹ / selected period | Unavailable until explicit records exist |
| Payable position | explicit payable settlement/position records | `PAYABLE` | `financialFactModel` | ₹ / selected period | Unavailable until explicit records exist |
| Cash movement | explicit cash settlements plus known financing payments | `CASH_MOVEMENT` | `financialFactModel` | ₹ / selected period | No inferred cash balance from revenue/expense |


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

## Formula precision and calendar-day rules

- Monetary calculations use integer paise internally. External persisted/display values may remain rupees, but calculation accumulators and comparison thresholds are paise integers; floating-point rupee accumulation is not an authority.
- EMI, loan schedule components, payment allocations, prepayments, overdue interest, outstanding principal, financing outflow, and recovery provisions round to whole paise at each monetary boundary.
- Loan interest day counting uses **IST calendar-day counting** (`Asia/Kolkata`), not elapsed 24-hour periods. The difference between the start and end calendar dates is counted; leap years are handled by the Gregorian calendar, so dates such as 2028-02-28 → 2028-03-01 count as 2 calendar days.
- Dead KM is exactly `vehicleKm - businessKm`. It is not clamped to zero; a negative result is preserved so an upstream data-integrity problem cannot be silently hidden.
- Operational revenue authority is exclusively `shifts.revenue` at shift completion. `trips.revenue` is supporting detail for reconciliation only and never contributes to authoritative ERP revenue totals.

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

This revision deliberately removes duplicate break-even orchestration from `performanceEngineV2`. `financePerformanceAdapter` is the sole application-facing orchestrator that combines canonical finance inputs with `deriveAuthoritativeBreakEven`, and canonical `loanEngine` is the sole loan/financing calculation authority. The base engine supplies operational observations and fuel evidence only; it does not calculate loan schedules, financing outflow, or a second break-even authority. Fuel authority is evidence-qualified rather than inferred from missing flags.


This artifact is the working source for the authority audit. It records repository-level CI verification as completed while explicitly leaving local Termux/device execution outside the GitHub-side claim. It must be updated whenever code/specification findings change the ownership, period, unit, or canonical field of a calculation.


## FAH-2 operational reconciliation

Shift-end revenue is the single operational revenue fact. When completed trips contain fare values, the End Shift authority compares their sum with the entered shift-end revenue. A mismatch or incomplete trip-fare detail blocks shift closure; no trip-level fare is promoted to revenue authority. Toll and parking are retained as operating-cost facts and are never added to revenue by the reconciliation. Post-close trip corrections re-evaluate the completed shift's reconciliation status so administrative changes cannot silently leave the supporting detail inconsistent with the authoritative shift revenue.


## FAH-3 financial fact model

FAH-3 establishes a single financial fact representation layer in `src/domain/finance/financialFactModel.js`. It maps authoritative upstream results into explicit facts with a distinct **basis**: `ACTUAL`, `OBLIGATION`, `PROVISION`, or `VARIANCE`. It does not recalculate revenue, operating cost, loan schedules, or break-even.

Non-promotion rules are explicit:

- Actual revenue is not cash unless an explicit settlement record exists.
- Actual operating expense is not cash by default.
- A financing obligation is not a financing payment.
- A provision is not an actual expense.
- Vehicle acquisition value is a capex fact, but does not prove cash settlement.
- Receivable/payable and cash positions remain unavailable until explicit canonical settlement/position records exist.
- Renewal actual-vs-provision variance requires an explicit compliance payment record; a compliance record's `cost` remains a provision/validity input.
- Target and break-even remain management representations and do not become accounting facts.

The model is intentionally usable before a full financial journal exists. It prevents the current application from silently treating incomplete settlement evidence as cash/accounting truth. A future journal/period-close implementation can consume these facts without changing the upstream calculation authorities.


## FAH-4 historical integrity

FAH-4 adds an immutable financial period snapshot boundary without creating a second calculation authority. `HistoricalIntegrityService.closePeriod()` reads the existing canonical performance snapshot, runs the existing `PerformanceService.getMetrics()` authority for the complete IST calendar month, and persists the resulting calculation snapshot, metrics, and financial facts as one closed-period record.

A closed period snapshot contains:
- complete IST month boundaries and schema version;
- a closed-at timestamp and explicit calculation evidence `asOf` boundary;
- source record IDs and per-store SHA-256 fingerprints for the captured calculation inputs;
- the exact normalized calculation snapshot consumed by the authority;
- the resulting metrics and FAH-3 financial facts;
- an integrity hash over the immutable snapshot payload.

The repository creates snapshots with an IndexedDB `add()` operation rather than `put()`, so an already-closed period cannot be overwritten through the repository. There is intentionally no delete/update API for closed snapshots. Reads verify the integrity hash before returning data; tampered snapshots are rejected rather than silently used.

Historical reads use the closed snapshot when one exists. An incomplete/current period remains dynamically calculated from the live canonical data. A completed period without a snapshot is explicitly reported as `CLOSED_WITHOUT_SNAPSHOT` rather than being presented as historically frozen. `HistoricalIntegrityService.reproduce()` recalculates the stored calculation inputs through the existing PerformanceService and returns the reproduced metrics/facts for regression comparison.

The snapshot is an evidence boundary, not an accounting journal, statutory period lock, or new business formula. Later canonical transactions cannot mutate the stored snapshot; later source changes therefore do not silently rewrite a closed historical result. The integrity hash detects tampering of the stored snapshot itself. SHA-256 is used as an integrity fingerprint, not as authentication or a substitute for a signed financial ledger.

FAH-4 contract coverage includes:
- exact complete-IST-month boundaries;
- refusal to close before month end;
- immutable duplicate-close behavior at repository level;
- later source mutations not changing the stored snapshot;
- tamper detection through integrity-hash mismatch;
- evidence-boundary validation;
- reproducibility from the captured calculation snapshot;
- open-period dynamic behavior versus closed-period snapshot behavior.

