# KFE Business Rules Register

**Status:** AUTHORITATIVE — SOLE BUSINESS-RULE AUTHORITY
**Purpose:** The single source of truth for KFE business meaning and the Phase 1–3 Business Rules Audit.

This file defines the authoritative business rules. Supporting specifications, freezes, audits, implementation notes, tests, UI, Android code, and provider adapters may implement or evidence these rules but must not create competing business definitions.

A rule is authoritative only when it has a BR ID here. Implementation correctness is established by Phase 1–3 audit evidence; this register does not imply that existing code is already correct.

## Authority rule

**One business fact → one authoritative rule → one canonical implementation path → one canonical persisted outcome → many presentation surfaces.**

If another document disagrees with this register, the other document is stale or this register must be explicitly amended through controlled governance.

## Single Source of Truth — Phase 0 Exit Control

This is the mandatory authority hierarchy for the entire KFE project. It prevents two documents, two implementations, or two roadmaps from defining the same thing.

### 1. Business-rule authority — exactly one

**KFE_BUSINESS_RULES_REGISTER.md is the sole authoritative source for KFE business meaning and business-rule definitions.**

- A business rule is identified by a stable BR ID in this register.
- Supporting specifications, freezes, audits, implementation notes, tests, UI, Android code, and provider adapters may explain, implement, verify, or evidence a BR ID.
- They MUST NOT redefine a business rule independently.
- If supporting material conflicts with this register, the supporting material is stale or the register must be explicitly amended through governance control.
- A new business rule requires an explicit addition/change here before implementation is treated as authoritative.
- docs/KFE-BUSINESS-RULES.md was a competing authority and has been removed after its substantive rules were migrated into this register.

### 2. Implementation authority — exactly one canonical path per business concept

A concept may have multiple technical layers (domain, application, persistence, UI), but it has one canonical business path. UI, Android overlay, notifications, and read models are consumers/adapters, not alternative business implementations.

| Business area | Canonical implementation path | Surface/adapters |
|---|---|---|
| Business/master data | src/application/admin/adminService.js → src/repositories/adminRepository.js | Admin UI, synthetic adapter |
| Calendar/time semantics | src/domain/time/ist.js + consuming domain services | PWA/overlay displays |
| Shift/odometer/end-shift | src/domain/work/shift.js + src/domain/work/endShift.js → src/application/work/workService.js → src/repositories/shiftTripRepository.js | Work UI, overlay |
| Trip lifecycle | src/domain/work/tripLifecycle.js is the lifecycle authority; WorkService orchestrates and ShiftTripRepository persists | Work UI, overlay, notifications |
| Revenue | shifts.revenue is authoritative; src/domain/performance/authoritativeRevenue.js reads it; src/domain/work/revenueReconciliation.js reconciles supporting trip fares | Work, Timeline, Performance, overlay |
| Fuel | src/domain/work/fuel.js + src/repositories/fuelRepository.js | Work/Admin/Performance |
| Finance/loans | src/domain/finance/loanEngine.js + finance application/read-model adapters | Admin/Performance |
| Break-even/economics | src/domain/performance/authoritativeBreakEven.js + performanceEngineV2.js | Performance/targets |
| Driver Target | src/domain/performance/driverTargetStabilization.js → src/application/performance/driverTargetService.js | Work/Admin/Performance |
| Reporting/read models | Canonical domain/application calculations feed src/repositories/performanceRepository.js and timeline services; read models do not become authorities | Timeline/Performance/Admin |
| Overlay | src/infrastructure/android/kfeOverlay.js + native KfeOverlayService; commands return to the canonical Work/repository path | Android only |
| Notifications | src/infrastructure/android/kfeRideNotificationService.js + native notification bridge; notification events/actions return to canonical business paths | Android notifications |

Important: a repository is not a second business authority merely because it persists data. A domain/application calculation is not a second authority merely because it produces a read-model representation. The authority is the canonical business path identified above.

Known Phase-1 validation items remain explicitly tracked: setTripStage() currently writes arbitrary stage values instead of enforcing tripLifecycle.js, and the Android END→fare pending-action path requires interruption/replay verification. These are audit findings, not alternate authorities, and must be handled through the Phase 1→3 defect process rather than silently changing Phase 0 scope.

### 3. Roadmap authority — exactly one

- KFE_LAUNCH_MASTER_PLAN.md — only document that defines phase sequence, phase entry/exit gates, and launch sequence.
- KFE_LAUNCH_STATUS.md — current phase/state only; it does not create a different roadmap.
- KFE_WORKING_RULES.md — execution/governance/deviation policy only; it does not create a different roadmap.
- KFE_LAUNCH_BACKLOG.md — deferred items only; it does not create a different roadmap.
- Specialized gates/specifications/freezes/audits are supporting documents. They cannot reorder phases or authorize launch independently.
- Historical phase/freeze records are evidence only and must be explicitly marked historical/non-authoritative.

### 4. Evidence authority

Tests and contracts prove or disprove rules; they do not define business meaning.

The canonical grouped contract runner is src/tests/runAllContracts.js. Individual contract files are evidence modules. Duplicate registration of the same suite is prohibited.

### 5. Conflict rule

When two sources disagree:

**Rule register wins for business meaning → canonical implementation path wins for implementation mechanics → master plan wins for sequencing → status wins for current state.**

The disagreement must be corrected/documented; it must never be resolved by silently choosing whichever source is convenient.

## Audit batches

### BR-01 — Business foundation
- Pre-business expenses
- Business start date
- Business-start boundary
- Opening balances / starting values
- Opening vehicle state
- Business configuration
- Vehicle setup
- Driver setup
- Target setup
- Loan setup
- Maintenance setup
- Compliance setup

### BR-02 — Master data
- Vehicle lifecycle and required fields
- Driver lifecycle and required fields
- Driver target lifecycle
- Loan lifecycle
- Maintenance record lifecycle
- Compliance record lifecycle

### BR-03 — Business calendar
- Business date
- Business-day rollover
- Shift belongs to business day
- Historical business dates
- Synthetic business date
- Current-date behavior
- Date/time boundaries

### BR-04 — Driver / shift
- Shift start
- Opening odometer
- Odometer gap
- Personal KM
- Dead KM
- Shift active/inactive
- Shift end
- Closing odometer
- Shift revenue
- Shift expenses
- Shift totals

### BR-05 — Trip lifecycle
- Create pickup
- Start ride
- End ride
- Trip state
- Canonical trip ID preservation
- Trip KM
- Trip duration
- Fare
- Completed-trip revenue
- Cancellation
- Cancellation revenue
- GPS/location
- Duplicate/replay protection
- Revenue authority/provenance

### BR-06 — Operating expenses
- CNG/fuel
- Fuel quantity
- Fuel price
- Fuel amount
- Fuel consumption
- Fuel cost/km
- Toll
- Parking
- Maintenance
- Other business expenses

### BR-07 — Finance
- Loan principal
- Loan start
- Interest rate
- Tenure
- EMI
- Interest/principal allocation
- Loan payment
- Prepayment
- Outstanding principal
- Finance totals

### BR-08 — Targets / economics
- Driver target
- Target progress
- Target remaining
- Revenue
- Expenses
- Net operating result
- Break-even
- Revenue/km
- Cost/km
- Productivity/profitability metrics

### BR-09 — Reporting / reconciliation
- Daily totals
- Shift totals
- Weekly totals
- Monthly totals
- Timeline aggregation
- Performance aggregation
- Cross-screen reconciliation

### BR-10 — Overlay / notifications contracts
#### Overlay
- Canonical state is shared by PWA and overlay
- Canonical trip ID is preserved
- Shift ID, driver, vehicle, timestamps and financial identity remain canonical
- PWA → canonical → overlay convergence
- Overlay → canonical → PWA convergence
- GO_TO_PICKUP
- START_RIDE
- END_RIDE
- ENTER_FARE
- CANCEL_RIDE
- Idempotency / replay protection
- No duplicate business records or financial outcomes
- Cancellation only in pickup state
- Completed trip fare attaches to the same completed trip

#### Notifications
- Canonical event determines notification eligibility
- Notifications ON permits KFE ride/action notifications
- Notifications OFF suppresses KFE ride/action notifications
- Foreground-service notification remains independent
- One canonical event produces one intended notification event
- PWA and overlay do not independently duplicate notifications

## Rule-chain test model

For each rule, Phase 1 must establish, where applicable:

**RAW INPUT → INPUT CHANNEL / SYSTEM CAPTURE → CANONICAL STORAGE → CALCULATION → DERIVED VALUE → DISPLAY → CROSS-SURFACE RECONCILIATION**

Derived values do not require a second user input channel unless the business rule explicitly defines one.

## Status convention

Each rule will eventually have:
- Rule ID
- Exact business definition
- Source/evidence
- Required input
- Storage field/entity
- Formula/derivation
- UI/input channel
- PWA behavior
- Overlay behavior
- Notification behavior
- Tests/contracts
- Audit result
- Defect ID(s)
- Verification evidence

## Authoritative business definitions

The substantive rules formerly held in the competing docs/KFE-BUSINESS-RULES.md have been migrated into this register. That file has been removed. The following definitions are now authoritative here.

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

- ERP revenue is the confirmed revenue on the completed Shift at shift completion.
- Completed-trip fares are supporting detail and must reconcile to Shift revenue when present; they do not override the Shift revenue authority.
- Cancelled/unvalidated trips do not become completed ride revenue or override Shift revenue.
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
