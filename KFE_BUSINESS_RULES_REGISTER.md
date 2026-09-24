# KFE Business Rules Register

**Purpose:** Authoritative inventory for Phase 1 Business Rules Audit.

This register is initially seeded from the agreed KFE launch requirements. During Phase 1 it must be reconciled against actual code, project documentation, contracts, tests, and operational definitions. A seeded item is not evidence that implementation is correct.

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
