# KFE Screen Contract

Every production screen must prove the following before it is considered complete:

- [ ] UI renders
- [ ] All required elements are reachable
- [ ] Valid input succeeds
- [ ] Invalid input fails correctly
- [ ] Busy/loading state works
- [ ] Cancel/close works
- [ ] Persistence occurs
- [ ] Reload recovers state
- [ ] Edit works
- [ ] Delete/soft-delete works where applicable
- [ ] Application boundary is respected
- [ ] Repository boundary is respected
- [ ] Business invariants hold
- [ ] Cross-module effects are correct
- [ ] Browser E2E succeeds
- [ ] Resilience/offline behavior succeeds

## Current product areas

KFE currently has exactly three active product areas:

1. **Work** — operational work, sessions, trips, ride capture and related workflows.
2. **Performance** — current business position, running cost and driver-facing operating interpretation.
3. **Admin** — back-office command center for Vehicle, Driver, Finance, Renewals, Maintenance, Loans and Settings.

There is no Timeline product area in KFE.

## Current presentation state

Performance and Admin are current production presentation surfaces.

Work is an active product area and its domain/application capabilities remain authoritative. The previous Work UI is not a current presentation contract and must not be resurrected from historical implementation. A new Work presentation must be built from the current Work contracts and Master Blueprint when implementation begins.

This distinction means **Work is active**, while its old UI is not authoritative.

## Presentation boundary

Active screens consume application-layer read models and commands. Presentation does not reach directly into domain, repository, infrastructure, IndexedDB or browser storage.

Admin must remain presentation-only. The UI consumes an application-layer read model and never reaches directly into domain, repository, infrastructure, IndexedDB or browser storage.

Admin Home is month-aware and contains:

- CURRENT STATE: vehicle, connection, current driver and odometer
- ATTENTION: actionable warnings only
- INSIGHT: human-readable interpretation
- PROFITABILITY position indicator, Profit/KM, Cost/KM and Margin
- BREAK-EVEN position indicator, Break-even, Current and Remaining
- Month View
- Finance
- Management

Month View contains Month Overview, Profitability, Break-even, Insight, Weekly rows and month-level activity derived from authoritative records. Month → Week → Day navigation is a presentation concept only and is not a separate product area or module.

Finance is derived/read-only and exposes six tiles: Revenue, Business Cost, Profit, Profit/KM, Cost/KM and Break-even.

Management is grouped as:

- BUSINESS: Vehicle, Driver
- FINANCE: one combined read-only Finance dashboard
- OPERATIONS: Renewals, Maintenance, Loans
- SYSTEM: Settings

## Work trip operator presentation and correction rule

The Work trip entry remains intentionally minimal. The driver chooses the operator at **Start Trip** from exactly these choices, in this order:

1. Uber
2. One way
3. Rapido
4. Ola
5. Savaari

Pickup, drop, fare, distance, toll, parking, odometer and trip time are not driver-entered fields at Start Trip. Start time is system-generated and the active trip timer is displayed as `HH:MM:SS`.

After the first trip, the selected operator becomes the **default convenience selection** for subsequent trips. The default may carry forward across days, but it is never the authoritative operator value.

Before **every** trip, the current/default operator must be displayed clearly enough for the driver to visually verify it. The driver can change the operator for that individual trip before starting it. The operator actually saved on the committed trip record is the authoritative business value.

The Start Trip / End Trip control is the same persistent swipe bar immediately above the bottom navigation. After a successful Start Trip it changes to End Trip and the active `HH:MM:SS` timer is shown. After a successful End Trip it returns to Start Trip. The state change itself provides clear confirmation that the operation succeeded and protects against accidental double submission.

A mistaken operator selection must be recoverable without forcing the driver to interrupt the operational flow. End Shift review must expose the day's trips and their recorded operators so a mistaken classification can be corrected through the normal controlled application path:

`Review → Edit → Validate → Recalculate → Save`

The correction updates the authoritative trip record; downstream read models and affected calculations are reconstructed/recalculated through existing application boundaries. A convenience default must never overwrite a previously committed trip merely because it carries forward to the next trip or next day.

Accidental Start Trip must likewise be recoverable through the controlled trip cancellation/void/correction lifecycle. A driver mistake must not create an uncorrectable fake business record, and correction must not bypass authoritative lifecycle and audit rules.

## Financial separation rules

**Today's Running Cost** is an ERP-calculated financial metric. Its current frozen definition is Fuel plus KM-based Maintenance Allocation, with personal use excluded.

**Daily Target** is driver-only operational/reference data. It never changes Revenue, Business Cost, Profit or Break-even and is never an accounting input.

Personal KM is excluded from business financial calculations. Business calculations consume authoritative source records after business rules and allocation/amortization.

There is no generic Other Expenses domain and no Tax Reserve bucket.

## Authoritative form rule

Every authoritative record type has one application-bound form boundary. CREATE and EDIT use the same authoritative record flow. Presentation surfaces collect/display inputs only.

Corrections follow:

`Edit → Validate → Recalculate → Save`

Financial results are never manually entered into Finance, Profitability or Break-even views.

## CI enforcement

The canonical CI treats this contract as a production-screen gate. Existing architecture, domain, application-boundary, persistence, browser, accounting/business-rule and resilience gates remain authoritative. Future screen-specific browser/E2E suites should be added to the canonical CI rather than creating a weaker isolated path.

Presentation selectors and DOM structure are replaceable implementation details. CI must validate user-visible behavior and authoritative workflow contracts rather than preserving obsolete markup solely because an older UI used it.
