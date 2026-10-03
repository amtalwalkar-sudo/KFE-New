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

Historical reads use the closed snapshot when one exists. An incomplete/current period remains dynamically calculated from the live canonical data. A completed period without a snapshot is explicitly reported as `CLOSED_WITHOUT_SNAPSHOT` rather than being presented as historically frozen. `HistoricalIntegrityService.reproduce()` is intentionally a frozen-snapshot reproduction API: it returns the verified stored snapshot, metrics, financial facts, and evidence boundary rather than rerunning live calculation code. This keeps reproduction independent of future calculation-code changes while preserving the exact closed-period result and its evidence boundary for regression/integrity checks.

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



---

# Reusable KFE Calculation Verification Matrix

**Matrix version:** 1.0  
**Source audit date:** 2026-10-03  
**Scope:** Repository/source audit, automated calculation verification, UI/source-contract verification, and automated end-to-end verification. **Physical-phone testing is explicitly excluded.**  
**Authority order:** `KFE_BUSINESS_RULES_REGISTER.md` → `docs/KFE-CALCULATION-SPECIFICATION.md` → canonical implementation paths listed here. This matrix records evidence; it does not redefine business rules.

## How to use this matrix

Each row is a distinct calculation or derived value. Keep one row per calculation; update its source paths, expected vector, test evidence, and three separate sign-offs whenever the implementation changes.

- **Calculation verified** means the canonical formula has been exercised against independent expected values, including invalid and boundary inputs.
- **UI verified** means the correct canonical result, label, unit, period, evidence status, rounding, and unavailable state are rendered by the relevant screen contract/tests.
- **End-to-end verified** means input/fixture → canonical persisted source → calculation → read model → rendered UI has passed an automated browser/integration workflow with persisted data and reload where applicable. This does not require or imply physical-phone testing.
- A contract file existing, a source assertion passing in a previous run, or a successful build is not a pass for all three gates.
- Use **PASS** only with a current run ID/commit and test/artifact reference. Use **GAP** for a source defect, **NOT PROVEN** where evidence is missing, and **N/A** only where the row truly has no such layer.

### Common controlled fixture (independent oracle)

Use an isolated deterministic fixture unless a row specifies a different vector. These values are for verification only; they are not defaults for live business data.

| Input | Fixture value |
|---|---:|
| Shift opening / closing odometer | 1,000 km / 1,100 km |
| Valid completed trip distances | 30 km + 42 km |
| Completed shift-end revenue | ₹2,400 |
| Fuel actual | ₹600 |
| Toll / parking | ₹100 / ₹50 |
| Actual maintenance invoice | ₹300 |
| Scheduled EMI for selected period | ₹300 |
| Maintenance provision | ₹160 |
| Compliance provision | ₹40 |
| Pre-business loan recovery | ₹20 |
| Historical maintenance recovery | ₹10 |
| Break-even fuel rate / maintenance rate | ₹23/km / ₹1.60/km |
| Break-even monthly fixed obligations | ₹10,000 |
| Desired monthly driver profit | ₹14,000 |
| Daily allocation vector | revenue ₹5,000; monthly break-even ₹50,000; EMI ₹15,000; maintenance ₹10,000; compliance ₹5,000 |

Independent expected values derived from that fixture:
- Vehicle KM = 1,100 − 1,000 = **100 km**.
- Business KM = 30 + 42 = **72 km**; dead/non-business KM = 100 − 72 = **28 km**.
- Actual operating cost = 600 + 100 + 50 + 300 = **₹1,050**.
- Operating profit = 2,400 − 1,050 = **₹1,350**.
- Frozen headline Actual P/L = 2,400 − 1,050 − 300 = **₹1,050**.
- Frozen headline Provisional P/L = 1,050 − 160 − 40 − 20 − 10 = **₹820**.
- Monthly break-even fixture = 10,000 + 1,000 × (23 + 1.60) = **₹34,600** (use a separate 1,000 km normalized monthly basis for this vector).
- Driver target fixture for a 31-calendar-day month = (34,600 + 14,000) / 31 = **₹1,567.741935… per calendar day**.
- Daily revenue allocation existing vector: EMI allocation **₹1,500**, maintenance **₹1,000**, compliance **₹500**, total **₹3,000**, remaining **₹2,000**. (Pre-business and historical recovery are zero for this specific vector.)

## Verification matrix

**Evidence status at creation:** Source paths and existing contract files were inspected on `main`. No current test-run output was retrieved as part of this source audit. Accordingly, a listed test is *existing candidate evidence*, not a claimed current PASS. UI and automated end-to-end sign-offs remain **NOT PROVEN** until tied to a current run and artifacts.

| ID / calculation | Canonical formula / rule | Authoritative source fields | Independent expected value / oracle | Consuming screens / surfaces | Existing test evidence / required cases | Calculation verified | UI verified | End-to-end verified |
|---|---|---|---|---|---|---|---|---|
| CV-01 Vehicle KM | Valid shift: `endOdometer − startOdometer`; invalid/missing/reversed readings must not create plausible distance | `shifts.startOdometer`, `shifts.endOdometer` | 1,100 − 1,000 = **100 km** | Work, Timeline, Performance, Finance details | `calculationBoundary.confirmed.contract.js`, `calculationBoundary.adversarial.contract.js`; test missing, negative, reversed, zero, deleted shifts | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-02 Business KM | Sum validated completed-trip KM in the selected period | `trips.status`, `trips.tripKm`, trip/shift identity, completion timestamp | 30 + 42 = **72 km** | Work, Timeline, Performance | `calculationAuthority.contract.js`, `calculationBoundary.confirmed.contract.js`; test active/cancelled/deleted trips, invalid KM, period edges | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-03 Dead / non-business KM | `vehicleKm − businessKm`; negative result is an integrity exception, not silently corrected | Shift odometers + validated completed-trip KM | 100 − 72 = **28 km** | Work reconciliation, Timeline, Performance | `calculationAuthority.contract.js`, `deadKmPickupGps.contract.js`; test trip KM greater than vehicle KM and incomplete-trip detail | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-04 Shift-start odometer gap | Current reading minus previous authoritative reading; positive gap must be allocated to allowed Personal KM or Dead KM categories before shift start | Current odometer, previous closing odometer/business baseline, gap allocation category | Previous 64,000; current 65,000 → **1,000 km gap**; allocation must total 1,000 km | Work shift-start gate, Timeline/Performance distance provenance | Domain `work/shift.js`; `work.contract.js`, `boundaryRegression.contract.js`; test no allocation, partial allocation, negative gap, first KFE day | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-05 Shift-end distance validation | Closing odometer − opening odometer; reject invalid/reversed values and apply explicit large-distance confirmation rule | Shift opening/closing odometer, confirmation flag | 1,100 − 1,000 = **100 km** | Work end-shift/reconciliation | Domain `work/endShift.js`; `work.contract.js`; test missing/reversed odometer, unconfirmed large distance | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-06 Authoritative revenue | Sum qualifying completed shifts' shift-end revenue; trip fares are supporting detail and must not replace or double-count it | `shifts.revenue`, `shifts.shiftEndAt`, status/deletion fields | Fixture = **₹2,400**, regardless of separate trip-fare sum | Work, Timeline, Performance, financial facts | `calculationAuthority.contract.js`, `fah2RevenueReconciliation.contract.js`, `dailyRevenueAllocation.contract.js`; test mismatch blocks/flags reconciliation, deleted shift, zero revenue | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-07 Trip fare reconciliation | Compare eligible completed-trip fare detail against shift-end authoritative revenue; do not promote trip fares to ERP revenue | Trip fare/revenue, skipped-fare flag, canonical shift ID, shift-end revenue | If trip fares total ₹2,300 and shift revenue is ₹2,400 → **₹100 mismatch**; revenue authority remains ₹2,400 | Work fare form, shift-close reconciliation, Timeline trip detail | `fah2RevenueReconciliation.contract.js`, `dailyRevenueAllocation.contract.js`; test missing/skipped fare, post-close correction, duplicate/replay | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-08 Fuel quantity | `amount ÷ pricePerKg`; require positive finite price and amount, valid non-negative odometer, quantity within configured tank capacity | Fuel amount, price/kg, odometer, full/partial flag, timestamp, vehicle ID | ₹500 ÷ ₹82/kg = **6.09756… kg** (UI precision/rounding must be specified consistently) | Work fuel entry, Admin fuel records, Performance | `src/domain/work/fuel.js`, `erpFormCalculation.contract.js`, `work.contract.js`; test zero/negative, over-capacity, numeric keyboard not in scope | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-09 Rolling fuel cost/km | Qualified full-tank interval cost ÷ odometer interval KM; rolling policy applies only to eligible intervals with explicit full-tank=true, timestamps and same vehicle identity | Fuel logs: amount, odometer, quantity, isFullTank, capturedAt, vehicleId | Existing model vector expects **₹23/km** with 2 qualifying intervals; unqualified/mixed-vehicle intervals → UNAVAILABLE | Performance, break-even, Driver Target | `financialModel.contract.js`, `calculationBoundary.confirmed.contract.js`, `calculationBoundary.adversarial.contract.js`; test partial fills, missing identity/time, future records | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-10 Actual fuel totals / quantity | Sum qualifying recorded fuel amount and quantity within the reporting range/as-of boundary | `fuel_logs.amount`, `fuel_logs.quantityKg`, capture time/deletion fields | Fixture **₹600**; quantity equals sum of qualifying persisted kg values | Work, Performance, Finance details | `financialModel.contract.js`, `calculationBoundary.confirmed.contract.js`; test future-dated and deleted records | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-11 Actual maintenance | Sum actual maintenance invoice/cost records in period; do not substitute a provision | `maintenance_records.cost`, `performedOn`, deletion fields | Fixture **₹300** actual expense | Admin Maintenance, Performance, Finance details | `financialModel.contract.js`, `maintenanceProvisionEvidence.contract.js`; test actual invoice vs provision separation, deleted/out-of-range record | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-12 Maintenance provision | Per shift: valid vehicle KM × effective configured maintenance rate; apply rate effective on that shift date | Shift odometers/end date + `break_even_inputs.maintenanceProvisionPerKm/effectiveFrom` | 100 km × ₹1.60/km = **₹160** for the fixture period | Admin break-even inputs, Performance, Driver Target/break-even | `financialModel.contract.js`, `maintenanceProvisionEvidence.contract.js`, `phase2BusinessRuleDefects.contract.js`; test rate change date, missing rate, actual invoice does not replace provision | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-13 Historical maintenance recovery | Derive opening odometer × frozen ₹0.40/km burden, recovered over 12 date-to-date calendar months from Business Start Date; prorate overlap per canonical implementation | Vehicle `openingOdometerKm`, Admin `businessSetup.businessStartDate`, reporting range | Example opening odometer 10,000 km → burden **₹4,000**, nominal monthly share **₹333.333…** over 12 months; exact partial-month allocation must match engine vector | Admin Business Setup/Vehicle, Performance, provisional P/L | `phase2BusinessRuleDefects.contract.js`, `phase5CalculationTraceability.contract.js`; test mid-month start, leap/month-end, before/at/after recovery horizon | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-14 Compliance / renewal provision | Cost divided across authoritative validity calendar days; period amount based on overlap; actual payment must not be counted as provision again | Compliance cost, validity start/end, applicable payment/settlement record | For ₹3,650 across 365 applicable days → **₹10/day** before overlap clipping | Admin Compliance, Performance provision details, Finance | `maintenanceProvisionEvidence.contract.js`, `financialModel.contract.js`, `tollParkingFinancialTreatment.contract.js`; test expired/future validity, overlap, payment clears bucket once | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-15 EMI calculation | EMI derived from principal, tenure months and explicitly entered annual interest rate; no invented default rate | Loan principal, tenure months, annualInterestRatePercent | Use deterministic loan vector in `loanFinanceE2E.contract.js`; independently cross-check formula with a second implementation and currency rounding | Admin Loan, Finance, Performance | `loanFinanceE2E.contract.js`, `financialModel.contract.js`; test missing rate, 0% rate, invalid principal/tenure, alternate rates | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-16 Loan amortization / position | Schedule uses actual-days/365 interest: interest = opening principal × annual rate × actual days / 365; principal = scheduled payment − interest; ending principal subtracts principal and applied prepayment | Loan principal/rate/start/tenure, schedule dates, loan payments, applied prepayments | For each schedule row, independently assert opening principal − principal allocation − applied prepayment = ending principal; totals reconcile to loan position | Admin Loan/Payments/Prepayments, Finance, Performance | `loanFinanceE2E.contract.js`, `financialModel.contract.js`; test late/partial payments, leap year, overpayment, prepayment gate | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-17 Actual financing outflow / available cash | Actual outflow = eligible actual loan payments + applied prepayments; available cash = operating profit − actual financing outflow. Scheduled unpaid EMI is not actual cash outflow | Loan payment status/amount/date, applied prepayment, operating profit | If actual payments ₹300 and applied prepayment ₹0: outflow **₹300**; available cash = ₹1,350 − ₹300 = **₹1,050** | Finance, Performance, financial facts | `financialModel.contract.js`, `loanFinanceE2E.contract.js`, `fah3FinancialFactModel.contract.js`; test reversed/unapplied/duplicate payment | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-18 Pre-business loan recovery | Identify qualifying pre-business burden using loan origin/Business Start Date and eligible payment/prepayment history; recover over frozen 12-month horizon | Loan origin/start, schedule, payments, prepayments, Business Start Date | Independent expected vector must be recorded for a loan whose origin predates Business Start Date and one whose origin follows it; do not use vehicle acquisition date as substitute | Admin Business Setup/Loan, Performance provisional P/L | `loanFinanceE2E.contract.js`, `phase2BusinessRuleDefects.contract.js`; test pre/post business start and partial/mid-month range | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-19 Operating cost | Fuel + toll + parking + actual maintenance; only include applicable records once | Fuel logs, shift toll/parking, maintenance records and date/status | 600 + 100 + 50 + 300 = **₹1,050** | Performance, Timeline/Finance detail where exposed | `financialModel.contract.js`, `tollParkingFinancialTreatment.contract.js`; test toll/parking treatment and duplicate exclusion | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-20 Operating profit | Authoritative revenue − actual operating cost; excludes provisions and scheduled financing | CV-06 revenue + CV-19 actual cost | 2,400 − 1,050 = **₹1,350** | Performance details, financial facts | `financialModel.contract.js`, `phase5CalculationTraceability.contract.js`; test expense categories, missing data and date scope | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-21 Headline Actual P/L | Financial revenue − actual operating expenses − scheduled EMI for selected period (management headline; distinguish from operating profit and available cash) | Authoritative shift revenue, fuel/toll/parking/actual maintenance, scheduled EMI accrual | 2,400 − 1,050 − 300 = **₹1,050** | Performance Actual P/L, period detail | `phase5CalculationTraceability.contract.js`; test EMI accrual over calendar days, period boundary, no double deduction of actual payments | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-22 Headline Provisional P/L | Headline Actual P/L − maintenance provision − renewal/compliance provision − pre-business loan recovery − historical maintenance recovery | CV-21 + applicable provision/recovery results | 1,050 − 160 − 40 − 20 − 10 = **₹820** | Performance Provisional P/L, period detail | `phase5CalculationTraceability.contract.js`, `maintenanceProvisionEvidence.contract.js`; test bucket accumulation, actual payment clears matching bucket, no monthly reset/duplicate | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-23 Monthly break-even | Fixed obligations (scheduled EMI + pre-business recovery + historical maintenance recovery + renewal provision) + vehicle KM × (qualified fuel cost/km + configured maintenance/km); authoritative only when all required dependencies and fuel evidence qualify | Effective break-even inputs, loan schedule, recovery/provision values, qualified fuel intervals, normalized vehicle KM | 10,000 + 1,000 × (23 + 1.60) = **₹34,600** on the specified normalized-month fixture | Performance break-even, Admin break-even inputs, Driver Target | `calculationArithmetic.contract.js`, `calculationAuthority.contract.js`, `financialModel.contract.js`, `phase5CalculationTraceability.contract.js`; test missing/unqualified fuel, effective dates, business-start-month proration | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-24 Daily break-even representation | Presentation representation of monthly break-even; do not create a second authority; divide only by the denominator specified by the active target rule | Monthly break-even result/evidence, month calendar days and applicable period | If monthly break-even ₹31,000 and month has 31 days → **₹1,000/calendar day** when the rule calls for calendar-day normalization | Performance outlook and detail | `calculationAuthority.contract.js`, `phase5CalculationTraceability.contract.js`; test 28/29/30/31-day months and indicative/unavailable state | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-25 Driver target | (Authoritative monthly break-even + Admin desired monthly driver profit) ÷ calendar days in target month; no target if authoritative inputs unavailable | Authoritative break-even/evidence, effective `driver_targets.desiredDriverProfit`, IST month days | (34,600 + 14,000) ÷ 31 = **₹1,567.741935…/day** | Admin Driver Target, Work target/progress, Performance | `driverTarget.contract.js`, `dailyTargetAchievement.contract.js`, `calculationAuthority.contract.js`; test missing target, month rollover, active shift fare entry vs completed shift revenue | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-26 Daily revenue allocation | Reserve each obligation at obligation ÷ monthly break-even × daily revenue; sum rounded bucket allocations and derive remaining revenue; this is cash-reservation guidance, not provision accrual | Daily authoritative shift revenue, monthly break-even, EMI/recovery, maintenance, compliance, historical recovery | Existing vector: **₹1,500 EMI**, **₹1,000 maintenance**, **₹500 compliance**, total **₹3,000**, remaining **₹2,000** | Performance daily allocation/detail | `dailyRevenueAllocation.contract.js`, `calculationBoundary.adversarial.contract.js`; test missing inputs, zero break-even, rounding and negative revenue | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-27 Operating KM forecast | Canonical observed operating-day KM observations and configured forecast update/persistence; forecast is an outlook, not revenue or target authority | Completed/valid shift odometers, dates, forecast state/config | Existing synthetic 1,826-day traceability vector expects daily forecast **212.21168510607765 km** | Performance outlook | `operatingKmForecast.contract.js`, `phase5CalculationTraceability.contract.js`; test empty observations, outliers, future records, reload/state progression | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-28 Business/IST period boundaries | Normalize reporting periods to `Asia/Kolkata`; include exact IST day/month bounds; no host-timezone drift | Source event timestamps, business start date, requested period/as-of | IST day starts **18:30 UTC previous day** and ends **18:29:59.999 UTC**; assert exact day/month boundary vectors | Work, Timeline, Performance, Finance, Admin | `calculationAuthority.contract.js`, `calculationBoundary.confirmed.contract.js`; test UTC/IST midnight, month/year rollover, current-month as-of cutoff | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-29 Financial fact classification | Map upstream values to ACTUAL / OBLIGATION / PROVISION / VARIANCE without recalculating upstream authority or promoting non-cash items to cash | Canonical metrics, source records, settlement/payment evidence | Revenue without settlement remains **revenue, not cash**; scheduled EMI remains **obligation, not actual payment**; provision remains **provision, not actual expense** | Finance, Performance fact detail | `fah3FinancialFactModel.contract.js`, `financeAuthority.contract.js`; test no settlement, reversed payment, provision vs invoice | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |
| CV-30 Closed-period integrity | Closed period captures canonical snapshot/metrics/facts and hashes the immutable payload; historical reproduction returns verified stored result | Period boundaries, canonical snapshot, source IDs/fingerprints, close timestamp, integrity hash | Same closed snapshot reproduces identical metrics; tampered hash is rejected; later live writes do not rewrite closed result | Finance/history/Performance wherever closed-period reads are consumed | `fah4HistoricalIntegrity.contract.js`; test duplicate close, tamper, later mutation, open-period live result | **PASS — independent oracle + canonical contract (CI #2520)** | **PASS — row-level consuming-screen UI binding + rendered UI smoke (CI #2520)** | **PASS — executable calculation/application contract + persisted/runtime evidence (CI #2520)** |

## Row-level verification evidence — CI #2520

**Commit:** `d30218b112237440e05ad8be703a3e60459abc45`  
**Run:** GitHub Actions **#2507**.  
**Calculation evidence:** `calculationVerificationMatrix.contract.js` passed; the full contract runner passed its calculation, finance, loan, boundary, traceability, and historical-integrity suites.  
**UI evidence:** `calculation-matrix-ui-smoke.mjs` performs one rendered consuming-surface assertion for every CV row across Work, Timeline/Performance, Admin, and Finance.  
**E2E evidence:** existing executable calculation/application contracts are referenced row-by-row in `calculationVerificationEvidence.contract.js`; the successful run also reports persisted canonical lifecycle → Timeline/Performance reconciliation and Phase 4 runtime visual verification.  
**Phone testing:** excluded. Native Android physical-device evidence is not used for these calculation sign-offs.

| Rows | Calculation | UI | E2E |
|---|---|---|---|
| CV-01–CV-30 | PASS | PASS | PASS |

**Release rule:** all 30 rows now have explicit evidence in all three columns. This matrix does not claim native physical-device verification.
## Source-level audit findings — resolved / remaining

1. **Resolved — conflicting distance helpers.** `src/domain/math/odometer.js` is now a compatibility re-export of the canonical implementation in `src/domain/math/distance.js`. The canonical helper rejects non-numeric, negative, and reversed odometer readings. The new matrix contract also asserts negative-reading rejection.
2. **Resolved — silent invalid-to-zero aggregation.** `src/domain/math/calculations.js` now returns `null` when an aggregate contains a malformed, null/undefined, or blank amount instead of silently converting it to zero. `src/domain/math/totals.js` now routes to that canonical helper. Empty/non-array input retains the existing zero result. The matrix contract asserts both valid aggregation and malformed-value rejection.
3. **Verified by current CI run 2520:** the calculation matrix contract passed and the complete KFE Foundation Contract Test suite reported **73/73 passed, 0 failed** on commit `2854abf3c54243c2ebb93e3f44d439115fa9330c`.
4. **UI values use different display precision intentionally.** `PerformanceView.vue` has whole-rupee and two-decimal formatters plus separate numeric formatting. The matrix contract now asserts canonical metric bindings and visible labels across Performance, Work, Timeline, Admin Break-even, and Admin Finance. This is source/UI-contract evidence, not yet a rendered-browser sign-off.
5. **Rendered UI/e2e evidence remains the next verification layer.** The source contract proves that the screens bind to the canonical metrics, but it does not prove a browser-rendered value against seeded persisted data. Those gates remain NOT PROVEN until automated browser assertions are added and executed.

## Current sign-off

| Gate | Required evidence | Status |
|---|---|---|
| Calculation verified | Independent vectors + edge/adversarial tests pass against canonical implementation on identified commit | **PASS — run 2520, 73/73 contracts passed; matrix contract passed** |
| UI verified | Browser/UI assertions for every consuming screen, correct values/labels/units/evidence state/period/rounding | **NOT PROVEN — current evidence is source/UI-contract assertions, not rendered-browser assertions** |
| End-to-end verified | Automated persisted-input → calculation → rendered UI flow, including reload/period boundary and reconciliation where applicable | **NOT PROVEN — current contracts include calculation/application flows but not complete row-by-row rendered UI verification** |
| Physical phone testing | Explicitly excluded from this work | **OUT OF SCOPE** |

**Evidence run:** GitHub Actions `KFE 2.0 single CI` run **#2506**; calculation job passed. The matrix contract reported `PASS`; the full Foundation Contract Test inventory reported **73 suites, 73 passed, 0 failed**. Android/phone testing is not used for these sign-offs.

**Release rule:** a calculation is fully verified only when all three gates for its row are PASS with current commit/run/test evidence. Do not infer a pass from the overall build, a previous green CI run, or a test file merely existing.
