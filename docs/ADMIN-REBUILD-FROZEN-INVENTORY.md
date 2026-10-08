# Admin Rebuild — Frozen Inventory and Acceptance Contract

**Purpose:** Rebuild Admin forms around authoritative business facts, calculation ownership, canonical persistence, and the universal form/recovery contracts. The previous UI and its field list are discovery evidence—not a reason to retain redundant or non-authoritative inputs.
**Baseline:** `main` at `4faf972761ea994796a98e6cb5c3201684cb61b5`.
**Authority order:** `KFE_BUSINESS_RULES_REGISTER.md` → `docs/KFE-CANONICAL-DATA-CONTRACT.md` / architecture and persistence contracts → universal form and recovery contracts → current Admin definitions as field-discovery evidence.

## Non-negotiable boundaries

- Replace the Admin UI as one coherent implementation; do not layer a second Admin over the current one.
- Keep `AdminService`, `AdminRepository`, domain services, canonical stores, validation rules, mutation/audit behavior, stable IDs, and soft deletion.
- Treat existing headings and fields as an inventory to reconcile against canonical business rules, not a requirement to reproduce the old forms. Keep stable canonical field keys and meaningful labels for retained facts; remove duplicate inputs, calculated values, and fields owned by another authoritative subsection. A removed presentation field must not silently delete canonical data without a governed migration.
- UI must submit through existing application commands. No direct database writes from components.
- Native direct entry only: no popup typing editor, readonly business inputs, reactive per-keystroke rehydration, or parallel field state authority.
- Cancel/navigation never commits; save validates then commits; failures never display success; destructive reset/restore requires explicit confirmation.
- Do not add operational Shift, Trip, refuelling-log, generic Expense, or other operational-authority forms to Admin. The existing one-time fuel-baseline prerequisite remains a distinct Diagnostics → Calculations setup flow and writes through `CalculationsService`; it is not a replacement for Work refuelling capture.
- Derived values (EMI, quantities where calculated, KM totals, provisions, break-even and target results) remain calculated by their existing authoritative paths, not typed as duplicate facts.

## Existing Admin navigation headings

- Diagnostics → Calculations
- Business Setup → Business Setup, Vehicle, Driver
- Vehicle Records → Compliance, Maintenance
- Finance → Loan, Prepayments, Ledger
- Target → Driver Monthly Target, Maintenance per KM
- Settings → Backup & Restore, Application Settings, Data Reset

Current source also exposes Loan Payments and Payments/Settlements as record actions within their parent records; preserve these entry flows and headings.

## Business-owned input inventory (reconciled against `adminFormDefinitions.js`)

The rebuilt form groups organize the following source facts by business purpose. Fields that duplicate another authority or only describe a derived value are not entered manually.

### Business Setup
- Business Start Date (date, required)
- Notes (textarea)

### Vehicle
- Registration number (text, required)
- Make (text, required)
- Model (text, required)
- Variant (text)
- Acquisition date (date, required)
- Acquisition cost/value (number, minimum 0)
- Opening odometer (km) (number, required, minimum 0)
- Fuel type (select: CNG, Petrol, Diesel, Electric, Hybrid; required)
- Tank / battery capacity (number, minimum 0)
- Vehicle status (select: Active, Inactive, Sold; required; default Active)
- Status date (date)
- Sell price (number, minimum 0)
- Sale date (date)
- Active (checkbox, default true)
- Notes (textarea)

Legacy `vehicle.expiryDate` values from older records are preserved during unrelated vehicle edits but are no longer editable in the vehicle form; compliance records own dated renewal validity.

### Driver
- Full name (text, required)
- Phone number (text)
- Driving licence number (text)
- Licence expiry (date)
- Joined on (date)
- Status (select: Active, Inactive, Suspended; required; default Active)
- Assigned vehicle (select, linked to existing vehicles)
- Notes (textarea)

### Compliance
- Vehicle (select, required)
- Compliance name (text, required)
- Validity · From (date, required)
- Validity · Upto (date, required)
- Compliance cost (number, required, greater than 0; actual payment is recorded separately in Payments / Settlements)

### Maintenance
- Date (date, required)
- Odometer (km) (number, required, minimum 0)
- Maintenance (text, required)
- Amount (number, required, greater than 0)
- Notes (textarea)

### Loan
- Lender (text, required)
- Account reference (text)
- Loan amount (number, required, greater than 0)
- Tenure (months) (number, required, minimum 1)
- Loan start date (date, required)
- Annual interest rate (%) (number, required, minimum 0; never assume a global default)
- Loan status (select: Active, Closed, Settled; required; default Active)
- Notes (textarea)

### Loan Payments
- Loan (select, required)
- Actual payment date (date, required)
- Actual amount paid (number, required, greater than 0)
- Notes (textarea)

### Prepayments
- Loan (select, required)
- Prepayment date (date, required)
- Actual prepayment amount (number, required, greater than 0)
- Reason (textarea)
- Notes (textarea)

### Payments / Settlements
- Settlement type (select: Payment; required; default Payment)
- Paying for (select: Maintenance, Compliance; required)
- Source record (select, required)
- Payment date (date, required)
- Amount paid (number, required, greater than 0)
- Payment method (select: Cash, Bank transfer, UPI, Card, Cheque, Other; default Cash)
- Payment reference (text)
- Notes (textarea)

### Driver Monthly Target
- Driver (select, required)
- Month / effective date (date/month semantics as already wired; required)
- Monthly target / desired driver profit (number, required, minimum 0)
- Planned non-working dates (textarea; YYYY-MM-DD, one per line or comma separated)
- Active (checkbox, default true)
- Notes (textarea)

### Maintenance per KM
- New rate per KM (number, required, minimum 0)
- Change date (date, required)
- Notes (textarea)

### Break-even Planning Inputs / Calculations
- Change date (date, required)
- Maintenance provision per vehicle km (number, required, minimum 0; existing default 1.6 only where the definition supplies it)
- Notes (textarea)
- Fuel baseline is a separate setup form under Diagnostics → Calculations, not a field inside the break-even form. Inputs: Odometer (km), Price / kg, Amount, and a compact Partial tank fill checkbox. Quantity is calculated as Amount ÷ Price/kg and must remain non-editable. The save path writes an authoritative fuel log through `CalculationsService`.

### Settings
- Backup & Restore: Enable daily backup, Dropbox access token, backup/restore actions and confirmation.
- Application Settings: Light/Dark/Auto theme and Notifications toggle.
- Data Reset: destructive reset action with explicit confirmation.

## Rebuild acceptance gates

1. Every required business-owned input above is represented in the rebuilt UI; no old field is retained merely for visual parity.
2. Every definition key remains bound to its existing service/repository contract.
3. All reference selectors load canonical related records and persist IDs, not display labels.
4. Required/range/date/select/domain validation remains enforced in the authoritative service/repository path.
5. Direct typing into alphanumeric fields remains in the focused field; number fields expose appropriate native numeric keyboards.
6. Enter/Next moves predictably between eligible fields; multiline text retains newline entry; final action is clearly reachable.
7. Form content and actions remain reachable with Android keyboard open, at narrow viewport sizes, and with shell navigation visible.
8. Cancel leaves authoritative state unchanged; save success is shown only after confirmed commit; failures retain useful user-entered data and show the real error.
9. Edit preserves record identity and immutable contractual terms; loan correction follows the existing audited correction path.
10. Admin deletion follows governed soft-delete/recovery rules; reset and restore retain explicit destructive confirmation.
11. Run all existing contracts, build, UI isolation, Android release gate, and route/runtime checks before merge.
12. Reconcile any failed contract against the authoritative documents; never weaken a business rule just to make a test green.
