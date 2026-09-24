# KFE Calculation Specification

**Status:** AUTHORITATIVE
**Purpose:** Single human-readable authority for KFE formulas, calculation inputs, units, time basis, and calculation dependencies.

The business meaning of each calculation is governed by `KFE_BUSINESS_RULES_REGISTER.md`. This document defines the arithmetic and data authority. The machine-readable registry in `spec/calculations/index.json` remains a code-facing index and must not contain conflicting formulas.

## 1. Calculation authority

- Calculations belong to the domain/calculation layer.
- UI, presentation, providers and persistence adapters do not independently calculate business values.
- Every changed financial formula requires a deterministic regression vector before deployment.
- Derived values must be reproducible from authoritative persisted inputs.
- Unsupported inputs must not be invented.

## 2. Core movement calculations

### Total Vehicle KM

`vehicleKm = endOdometer - startOdometer`

Authority: shift start/end odometer.

### Business KM

`businessKm = sum(validated completed trip KM)`

Authority: validated trip records.

### Dead / non-business KM

`deadKm = vehicleKm - businessKm`

The result must reconcile with authoritative vehicle movement. A negative result is a data-integrity exception, not an opportunity to silently change source values.

## 3. Revenue

### Reporting-period revenue

`revenue = sum(completedShift.revenue)`

The completed Shift's confirmed end-of-shift revenue is the single ERP revenue authority. Completed-trip fares are supporting detail only and are used for reconciliation/display; they do not override Shift revenue.

Included records:
- completed shifts with a valid shift-end revenue value.

Trip records remain important for ride history, business KM and reconciliation, but `Trip.revenue` is not an ERP revenue authority.

## 4. Actual operating cost

`operatingCost = fuel + toll + parking + actualMaintenance`

Where each component is the actual recorded amount for the reporting period.

### Fuel actual

`fuelCost = sum(recorded fuel cost)`

### Toll actual

`tollCost = sum(shift toll amounts)`

### Parking actual

`parkingCost = sum(shift parking amounts)`

### Maintenance actual

`actualMaintenance = sum(actual maintenance invoice/cost amounts applicable to the period)`

Actual maintenance remains separate from maintenance provision.

## 5. Operating profit

`operatingProfit = revenue - operatingCost`

This is an actual-performance result.

Provisions are not deducted here.

## 6. Financing and Available Cash

### Actual financing outflow

`actualFinancingOutflow = actualLoanPayments + actualAppliedPrepayments`

Loan payment inclusion:
- status other than Reversed is eligible for actual payment totals.
- applied prepayments are included when actually applied.

### Available Cash

`availableCash = operatingProfit - actualFinancingOutflow`

Available Cash is a cash-surplus measure.

It does not subtract scheduled but unpaid EMI, future compliance, future maintenance provision, or other planning provisions.

## 7. Provision planning

`provisionPlanning = maintenanceProvision + renewalProvision + otherProvision`

Provision planning is informational/planning data and does not reduce actual Operating Profit or Available Cash until an actual payment occurs.

`otherProvision` remains zero/unmodeled until an authoritative rule and input exist.

## 8. Fuel cost per KM

Fuel efficiency/cost calculation uses full-tank intervals only.

Rules:

1. The first full-tank fill establishes the baseline.
2. A full-tank interval provides the observed KM and fuel quantity.
3. Cost/km is derived from actual interval cost divided by interval KM.
4. Latest rolling observations may be averaged according to the configured rolling policy.
5. Partial fills do not independently establish a full-tank efficiency interval.

The domain fuel calculation remains the authority.

## 9. Maintenance provision

Maintenance provision and actual invoice are separate.

Each maintenance planning item uses exactly one dimension:

- KM-based, or
- TIME-based.

For the currently agreed break-even planning model:

`maintenanceProvisionForBreakEven = vehicleKm × maintenanceProvisionPerKm`

The frozen maintenance baseline distinguishes historical/pre-KFE allowance and KFE predictive maintenance. Exact category rates must come from authoritative configuration rather than being invented in code.

## 10. Loan amortization

For each scheduled payment period:

`interest = outstandingPrincipal × annualRate × actualDays / 365`

`principal = scheduledPayment - interest`

`endingPrincipal = openingPrincipal - principal`

Prepayment:

`prepaymentCharge = 0`

`endingPrincipalAfterPrepayment = endingPrincipal - appliedPrepayment`

Rules:

- Reducing-balance loan.
- Actual days/365 interest basis.
- Principal and interest are separately represented.
- Prepayment reduces principal.
- EMI remains unchanged; tenure reduces.
- Scheduled obligation is informational for planning.
- Actual payment is a cash outflow.
- No financing component is deducted twice.

## 11. Compliance provision

Compliance is calendar/validity based.

For a compliance item with cost `C` and validity period `V`:

`dailyComplianceProvision = C / applicableCalendarDays(V)`

For a reporting interval, the applicable provision is based on the overlap between the item's validity period and the reporting period, subject to the authoritative validity dates.

Actual compliance payment remains an actual cash/expense record and is not duplicated by the provision.

## 12. Fixed break-even cost

The fixed-cost model uses calendar days.

### Daily EMI cost

`dailyEMICost = applicableScheduledEMI / applicableCalendarDays`

The exact amortization period follows the active loan schedule and calendar basis.

### Daily compliance cost

`dailyComplianceCost = applicableComplianceCost / applicableCalendarDays`

### Daily fixed cost

`dailyFixedCost = dailyEMICost + dailyComplianceCost`

Fixed costs apply on every calendar day, including off/non-working days.

## 13. Dynamic break-even cost

### Fuel component

`fuelDynamicCost = vehicleKm × actualFuelCostPerKm`

### Maintenance component

`maintenanceDynamicCost = vehicleKm × maintenanceProvisionPerKm`

### Dynamic cost

`dynamicCost = fuelDynamicCost + maintenanceDynamicCost`

## 14. Shift break-even cost

`breakEvenCost = dailyFixedCost + dynamicCost`

This is the required cost coverage for the applicable day/shift planning context.

Important:
- vehicle KM, not business-trip KM alone, drives the dynamic break-even calculation.
- working hours are not an independent break-even cost dimension unless a future explicit business rule adds one.
- the obsolete `fixed + businessKm × km + workingHours × hour` model must not be reintroduced.

## 15. Driver target

The driver target is not a new smoothing-window calculation.

### Base requirement

`baseTarget = applicableBreakEvenCost + desiredDriverProfit`

The already-frozen rolling recovery/surplus mechanism then adjusts the active-day target using the carried lifetime balance.

Conceptually:

`activeDayTarget = baseTarget + recoveryAdjustment`

where `recoveryAdjustment` represents the outstanding historical/rolling recovery burden after prior active-day results and surplus have been applied.

### Driver Target Stabilization — implementation clarification

The driver's daily target is dynamically derived from the applicable break-even requirement, the Admin-defined desired take-home/profit amount, and the driver's existing rolling recovery/surplus balance.

- Active working days participate in the rolling balance.
- Inactive/off days do not create a driver target and do not increase the recovery requirement.
- A below-target active day creates/reinforces recovery.
- An above-target active day reduces outstanding recovery or creates surplus.
- Future active-day targets adjust progressively from the existing carried balance rather than resetting independently each day.
- No separate smoothing window, arbitrary averaging period, or new target-smoothing formula is introduced.

### Implementation invariant

> **Driver Target = current required target after applying the existing lifetime/rolling recovery balance.**

This invariant defines how the frozen rolling mechanism must be interpreted by implementation. It does not create a second target formula or a new smoothing system.

### Required implementation boundary

The rolling recovery/surplus balance is an existing frozen business mechanism and must remain the source of truth for `recoveryAdjustment`. Implementations must not substitute `targetRevenue` alone, an N-day average, an arbitrary smoothing window, or an independently invented recovery ledger when deriving the active-day driver target.

Until the authoritative persisted representation and exact existing balance transition are available to the implementation, code must not invent a replacement balance formula. The specification and regression contract must instead prevent such silent reinterpretation.

Rules:

- Off/inactive day: no target.
- Bad active day: recovery balance increases.
- Good active day: recovery balance decreases; surplus can carry forward.
- Target changes are stabilized through the carried balance, not an arbitrary newly introduced N-day average.
- The recovery balance must remain auditable.

## 16. Pre-activation recovery calculations

The frozen business rule establishes the recovery categories and periods:

- historical maintenance burden
- unpaid/pre-activation EMI or loan burden
- pre-activation repairs/maintenance
- accepted initial used-vehicle/setup/business costs
- ordinary applicable costs: 12-month recovery
- compliance: actual calendar/validity treatment

For ordinary eligible recovery amount `R`:

`recoveryRate = R / 12 months`

The active-day target system consumes this burden through its rolling recovery contribution rather than treating the entire historical amount as a current-period actual expense.

Where a category has a more specific frozen treatment, that specific treatment takes precedence over the generic 12-month rule.

## 17. Rolling recovery / lifetime balance

The target system retains a carried balance representing prior active-day under/over-performance and applicable recovery burden.

At a conceptual level:

`rollingBalance_next = rollingBalance_current + requiredRecoveryContribution - realizedTargetContribution`

The exact stored sign convention must be consistent throughout the implementation. Positive/negative presentation must never be changed silently.

Active financial days are the only days that participate in driver-target generation.

## 18. Provision bucket balance

For each provision bucket:

`bucketBalance = accumulatedRequiredProvision - actualAppliedPayment`

Interpretation:

- `> 0` = provision available/required balance remains.
- `= 0` = exactly covered.
- `< 0` = shortfall/recovery required.

No separate additional-requirement ledger is created.

## 19. Profitability metrics

### Profit per KM

`profitPerKm = actualProfit / authoritativeVehicleKm`

where the reporting definition of `actualProfit` is the applicable actual operating/financial profit measure; the implementation must name the layer explicitly and must not mix Operating Profit with Available Cash.

### Profit per hour

`profitPerHour = applicableActualProfit / validatedWorkingHours`

Zero denominators return an explicit unavailable/zero-safe result according to the reporting contract; no divide-by-zero value is invented.

### Revenue per KM

`revenuePerKm = revenue / authoritativeVehicleKm`

### Revenue per trip

`revenuePerTrip = revenue / completedTripCount`

### Revenue per hour

`revenuePerHour = revenue / validatedWorkingHours`

### Cost per KM

`costPerKm = operatingCost / authoritativeVehicleKm`

## 20. Reporting periods

The same calculation authority applies to:

- shift
- day
- month
- year
- custom reporting ranges.

Rolling metrics are additional context and must never replace actual period results.

## 21. Data completeness

A calculation must identify whether all required authoritative inputs are available.

If a required input is missing:

- do not silently substitute a guessed value;
- expose the calculation as incomplete/unavailable or use an explicitly defined estimate state;
- preserve the reason for the incomplete result.

## 22. Monetary precision

- Monetary boundaries use integer paise.
- Convert to display currency only at presentation boundaries.
- Avoid floating-point monetary accumulation.

## 23. Golden/regression policy

Every changed financial formula requires a deterministic regression vector before deployment.

Regression vectors must cover, where applicable:

- revenue
- operating costs
- operating profit
- Available Cash
- loan principal/interest
- prepayment
- maintenance provision
- compliance provision
- break-even
- driver target/recovery
- zero/empty periods
- missing authoritative inputs
- boundary dates
- active-day versus inactive/off-day target behavior
- carried recovery/surplus behavior without introducing an averaging window

## 24. Calculation ownership map

| Calculation | Authority |
|---|---|
| Revenue | Completed validated trip records |
| Vehicle KM | Shift odometer movement |
| Business KM | Validated trip records |
| Dead KM | Vehicle KM − Business KM |
| Fuel actual | Fuel logs |
| Maintenance actual | Actual maintenance records |
| Loan schedule | Loan + amortization rules |
| Actual loan cash outflow | Loan payment records |
| Actual prepayment cash outflow | Applied prepayment records |
| Compliance planning | Compliance validity + cost |
| Break-even | Loan/compliance daily fixed + vehicle-KM dynamic costs |
| Driver target | Break-even + desired profit + frozen rolling recovery mechanism |

## 25. Current formula conflicts explicitly retired

The following must not return:

- provisions deducted from actual Available Cash;
- scheduled EMI treated as an actual cash payment when unpaid;
- loan principal and interest deducted twice;
- break-even based only on business-trip KM;
- an independent variable-cost-per-hour break-even component without an approved rule;
- arbitrary new smoothing windows for the driver target;
- treating the Admin-entered desired driver profit/take-home as the complete active-day target without the existing rolling recovery/surplus balance;
- inventing a replacement recovery balance when the authoritative existing balance representation is unavailable;
- invented “other business costs”.
