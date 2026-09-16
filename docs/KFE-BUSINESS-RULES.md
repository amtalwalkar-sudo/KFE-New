# KFE Business Rules

**Status:** AUTHORITATIVE
**Purpose:** Single human-readable authority for KFE business meaning and accepted business rules.

This document consolidates the accepted/frozen KFE business rules from the frozen implementation baseline, approved financial decisions, ride-capture decisions, and the current architecture consolidation. Historical documents are source material only.

## 1. Authority and change control

- KFE business meaning is defined here.
- Admin manages authoritative inputs; KFE calculates derived values.
- A historical document, implementation, provider, UI, or test does not override this document.
- A proposed change that conflicts with an accepted/frozen rule requires `🔴 DESIGN DRIFT / CONFLICT WARNING` before implementation.
- Nothing becomes frozen merely because it is documented; explicit approval is required for new major decisions.

## 2. Product boundary

- KFE is a single-vehicle ERP.
- Authoritative business records remain persisted and reconstructable.
- Derived values must not become competing sources of truth.
- Historical data remains intact through vehicle lifecycle changes.

## 3. Days, shifts and vehicle movement

- A shift has authoritative start and end odometer readings.
- Total Vehicle KM = End Odometer − Start Odometer.
- Shift movement is authoritative for total vehicle movement.
- Individual business-trip KM may come from validated trip/GPS data.
- Business KM and dead/personal KM must reconcile with authoritative vehicle movement.
- Driver must not manually override authoritative trip KM merely to make totals reconcile.
- Personal use is not business revenue and is excluded from business operating calculations.

## 4. Ride capture

- Ride screenshots may come from multiple operator apps/layouts.
- Multimodal extraction is provider-independent.
- OCR/AI provider choice is replaceable and must not own KFE business meaning.
- Current flow: screenshot → extraction → KFE validation → notification review/confirmation → save.
- Future auto-save may be added without changing the authoritative record model.
- Extractable ride facts include pickup, drop, fare, duration, ride timings, cancellation state and ride KM.
- Only validated completed trip records contribute to completed-trip revenue.

## 5. Revenue

- Revenue comes only from validated completed trip records.
- Cancelled/unvalidated records do not become completed revenue.
- Revenue is actual recorded business revenue, not a target or provision.

## 6. Expenses

KFE distinguishes actual costs from planning provisions.

### Actual operating costs

- Fuel actually recorded.
- Toll actually recorded.
- Parking actually recorded.
- Actual maintenance/invoice amounts actually recorded.

### Planning/provision amounts

- Maintenance provision.
- Compliance/renewal provision.
- EMI/scheduled obligation information.
- Other provisions only when an authoritative input/rule exists.

A provision is not an actual expense merely because KFE calculates it.

## 7. Maintenance

- Actual maintenance is recorded separately from maintenance provision.
- Each maintenance item has exactly one planning dimension: KM or TIME.
- Historical/pre-KFE maintenance burden is supported.
- Frozen maintenance baseline: historical/pre-KFE allowance ₹0.40/km; KFE predictive maintenance ₹1.60/km; actual maintenance remains separate.
- Maintenance provision can include the applicable personal-KM maintenance burden.
- Actual invoices reduce the relevant maintenance provision bucket.

## 8. Fuel

- Fuel logs capture authoritative refuelling facts.
- Fuel quantity may be calculated from amount and price/kg.
- Full-tank-to-full-tank efficiency is supported.
- Fuel cost/km uses full-tank intervals; the first full-tank fill establishes the baseline and rolling observations may be averaged.
- Actual fuel cost is used for actual performance.
- Fuel is not simultaneously treated as an unpaid future provision.

## 9. Loan and financing

- Loan uses reducing-balance amortization.
- Interest is calculated using actual days / 365.
- Each scheduled payment is separated into principal and interest.
- Principal reduces outstanding debt.
- Interest is a financing cost.
- Actual loan payments are cash outflows.
- Prepayment is allowed and has zero prepayment penalty.
- Prepayment reduces principal; EMI remains unchanged and tenure reduces.
- Full amortization/payment history is retained.
- Scheduled EMI is planning/informational; it is not deducted from actual performance merely because it is scheduled.
- No loan amount may be deducted twice.

## 10. Compliance

- Applicable compliance includes insurance, PUC, permits and other configured requirements.
- Expiry and reminders are supported.
- Compliance is calendar/validity based.
- Compliance provision is a planning amount, not an actual expense until the actual payment is recorded.

## 11. Provision buckets

The primary provision buckets are:

1. EMI
2. Maintenance
3. Compliance

Rules:

- Required provisions accumulate continuously according to their applicable rules.
- Actual payment reduces the relevant bucket.
- Positive balance means provision available.
- Zero means exactly covered.
- Negative means shortfall/recovery required.
- KFE does not create a separate “additional requirement” ledger.

## 12. Pre-activation / pre-business recovery

Pre-business burdens are historical recovery obligations rather than invented current-period actual expenses.

Supported categories include:

- Historical maintenance burden.
- Unpaid/pre-activation EMI or loan burden.
- Pre-activation repairs/maintenance.
- Initial used-vehicle/setup/business costs where accepted as applicable.

Recovery rules:

- Ordinary applicable pre-activation costs use the frozen 12-month recovery rule.
- Compliance follows its actual calendar/validity period.
- Recovery contributes to the lifetime rolling profit/loss/recovery mechanism and therefore can affect future driver targets.
- Pre-activation recovery must not be double-counted as an ordinary current-period actual cost.

## 13. Profitability model

KFE uses five conceptual layers:

1. Revenue
2. Operating Cost
3. Operating Profit
4. Provision Planning
5. Financing / Cash Position

Actual performance is driven by actuals.

- Operating Profit = Revenue − actual operating costs.
- Available Cash = Operating Profit − actual financing cash outflows recorded for the period.
- Provisions remain visible for planning and are not deducted from actual performance or Available Cash unless/until an actual payment occurs.
- Available Cash is a cash-surplus metric, not an accounting-profit label.
- Actual break-even, actual profit/loss, profit/km and profit/hour remain available for reporting.
- Daily, shift, monthly and yearly reporting must not hide actual results behind rolling metrics.

## 14. Break-even

Break-even planning uses the user's frozen business model:

### Fixed costs

- EMI amortized per calendar day.
- Compliance amortized per calendar day.
- Fixed costs apply every calendar day, including off/non-working days.

### Dynamic costs

- Vehicle KM × actual fuel cost/km.
- Vehicle KM × maintenance provision/km.

### Vehicle KM

Vehicle KM for the shift = End Odometer − Start Odometer.

The break-even model is therefore based on vehicle movement, not business-trip KM alone.

## 15. Driver target

- Admin enters desired driver take-home/profit target.
- The desired amount is above the applicable break-even requirement.
- The daily driver target is dynamically derived from the applicable break-even requirement, the Admin-defined desired take-home/profit amount, and the driver's existing lifetime/rolling recovery/surplus balance.
- Driver Target = current required target after applying the existing lifetime/rolling recovery balance.
- Active working days participate in the rolling balance.
- Inactive/off days do not create a driver target and do not increase the recovery requirement.
- A below-target active day creates/reinforces recovery.
- An above-target active day reduces outstanding recovery or creates surplus.
- Future active-day targets adjust progressively from the existing carried balance rather than resetting independently each day.
- The rolling balance is carried forward so target changes are smooth rather than resetting each day.
- Lifetime rolling profit/loss and recovery contribution remain visible to the target system.
- No separate smoothing window, arbitrary averaging period, or new target-smoothing formula is introduced.
- The frozen rolling recovery/surplus mechanism remains the source of truth for the target adjustment; an implementation must not replace it with an N-day average or an independently invented recovery ledger.

## 16. Calculation confidence and history

- Current calculations update when authoritative underlying data changes.
- Important report calculations retain auditable snapshots/history where required.
- Changes remain traceable.
- KFE indicates when a result depends on complete authoritative data versus missing/estimated inputs.

## 17. Unsupported costs

- KFE must not invent an amount for an unsupported business-cost category.
- A future cost enters the financial model only after an authoritative input and business rule are defined.

## 18. Money and data integrity

- Monetary boundaries use safe integer paise.
- Authoritative records are persisted.
- Derived values are reconstructable from authoritative records.
- Soft deletion preserves historical integrity where applicable.

## 19. Provider independence

Business rules must remain independent of:

- OCR/AI provider
- Backup provider
- Cloud provider
- Sync provider
- Native/Capacitor implementation
- External service

Providers are replaceable infrastructure adapters.

## 20. Governing rule

> **Admin manages inputs; KFE calculates everything else.**

> **One business fact → one authoritative source.**

> **Actuals drive actual performance; provisions drive planning.**
