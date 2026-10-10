# PWA Form-by-Form Save-Path Matrix

Audit basis: `main` at `1b5ca3186c5b8aa43f08b115da063a9ad5c40456`; regression-test branch `audit/pwa-form-regression-tests`. This matrix records source-level wiring. It is not a claim of physical-device verification.

## Active PWA routes

The router exposes four active route views: `/` Work, `/timeline` Timeline, `/performance` Performance, and `/admin` Admin. `FirstRunSetupView.vue` and `CalculationsView.vue` exist in source but are not directly registered as routes in `src/router/index.js`; treat them as non-routed/indirect surfaces until their reachability is demonstrated.

## Admin source-record forms

Shared UI: `src/components/admin/AdminSourceForm.vue` → `src/views/AdminView.vue` → `AdminService.save` (definition lookup + validation) → `AdminRepository.save` (canonical store mapping + mutation/audit). Existing contracts include `adminFieldMatrix.contract.js`, `admin.contract.js`, `adminFiveIntegrity.contract.js`, `erpFormCalculation.contract.js`, and `formIntegrityE2E.contract.js`.

| Form | Canonical persistence | Calculation/read-model consumer | Regression coverage / audit note |
|---|---|---|---|
| Business Setup | `settings` keyed by `businessSetup` | Business start-date boundary and business setup consumers | Admin field matrix + calculation/authority contracts; verify IST boundary end-to-end |
| Vehicle | `vehicles` | Vehicle economics, operating inputs, compliance/driver assignment | Admin field matrix + ERP form calculation |
| Driver | `drivers` | Driver assignment and driver-target relationship | Admin field matrix + relationship integrity |
| Compliance | `compliance_records` | Compliance status/cost and linked settlement/payment history | Admin field matrix + Admin integrity; relationship/payment path needs scenario test |
| Maintenance | `maintenance_records` | Actual maintenance expense and source-payment/settlement history; not the indicative maintenance-per-km provision | Admin field matrix + maintenance provision evidence; keep actual vs indicative sources separate |
| Loan | `loans` | Loan engine: EMI, outstanding position, scheduled/actual obligation | ERP form calculation + loan finance E2E |
| Loan Payments | `loan_payments` | Loan engine payment allocation and actual cash paid | ERP form calculation + loan finance E2E |
| Prepayments | `prepayments` | Loan engine prepayment effect/outstanding timeline | ERP form calculation + loan finance E2E |
| Settlements | `settlements` | Source payment history and actual payments against maintenance/compliance sources | Admin integrity; validate source relation and overpayment prevention |
| Driver Target | `driver_targets` | `DriverTargetService`, Performance target/achievement and Timeline target | Driver target + daily target achievement + timeline contracts |
| Break-even Inputs | `break_even_inputs` | Indicative break-even/target, including effective-dated maintenance provision per km | ERP form calculation + September break-even/target contracts |

### Admin secondary actions sharing the form component

| Surface | Save/confirm path | Important distinction |
|---|---|---|
| Driver target quick-entry | `AdminSourceForm` field changes → target submit handler → Admin service/repository | Separate quick-entry path to the same driver-target authority |
| Maintenance-per-km rate | `AdminSourceForm` → maintenance-rate submit handler → effective-dated break-even input | Indicative provision rate; must not rewrite actual maintenance records |
| Loan payment | Payment fields → preview/allocation → explicit confirmation → loan-payment save | Preview is not persistence; confirmed payment is the actual movement |
| Loan prepayment | Prepayment fields → estimate → explicit confirmation/save | Estimate is not persistence; saved prepayment affects loan engine |
| Maintenance/compliance source payment | Settlement fields → source/payment integrity checks → settlement repository | Cannot exceed linked source amount or exceed already-paid balance |
| Backup/restore | Backup/restore panel and backup service | Separate destructive/restore workflow; requires independent restore tests |
| Theme/settings and reset actions | Admin settings/actions through settings persistence | Not ordinary source-record calculation inputs; destructive actions require separate guard tests |

## Work route (`/`)

Presentation: `WorkModuleView.vue` and `WorkContextForm.vue`. Temporary edits are persisted separately through `WorkDraftService` → `FormDraftRepository` (`form_drafts`); drafts are not canonical business records and should clear only after successful commit or confirmed discard.

| Form/state gate | Commit path | Canonical persistence / consumers | Regression coverage / audit note |
|---|---|---|---|
| Start Shift / odometer gap gate | Work view → shift store → `WorkService.startShift` → `ShiftTripRepository.createShift` | `shifts`; reconstructed operational records feed Timeline and Performance | Work, form draft recovery, gap and lifecycle contracts; verify personal/dead allocation and gap acknowledgment |
| Trip details / fare, toll, parking | Work view → shift store → `WorkService.updateTrip` → `ShiftTripRepository.updateTrip` | `trips`; trip detail amounts are supporting records, while completed shift revenue remains authoritative | Canonical trip lifecycle, form integrity E2E, toll/parking treatment; verify skipped fare and exact trip identity |
| Cancellation | Work view → shift store → `WorkService.cancelTrip` → `ShiftTripRepository.cancelTrip` / trip lifecycle | Canonical `trips`; blank cancellation fee is numeric zero; cancellation revenue is supporting-only | Canonical trip lifecycle + end-to-end conformance; explicit blank/zero/reason tests |
| Fuel entry | Work view → `WorkService.recordFuel` → fuel validation → `FuelRepository.create` | `fuel_logs`; operational reconstruction feeds Timeline/Performance fuel totals and cost | Ride capture/form integrity; verify full vs partial state and odometer fat-finger guard |
| End Shift / reconciliation | Work view → shift store → `WorkService.endShift` → `EndShiftService` → `ShiftTripRepository.completeShift` | `shifts` and trip linkage; shift-level revenue is authoritative; additional toll/parking is additional-only | Work, toll/parking treatment, phase C financial finalization; verify incomplete trips and retry after persistence failure |
| Shift review / per-trip reconciliation inputs | Work review controls → end-shift commit path | Review revenue/km/operator inputs reconcile against canonical trip records; avoid double-counting shift revenue | End-to-end conformance and operational record tests; require exact trip identity and successful-commit draft clearing |

## Timeline route (`/timeline`)

| Form | Commit path | Consumer/authority | Regression coverage / audit note |
|---|---|---|---|
| Quick edit completed/cancelled trip | Timeline form → `WorkService.updateTrip` → `ShiftTripRepository.updateTrip` | Same canonical trip record; must not create a second trip or override shift-level revenue authority | Timeline + canonical lifecycle + form integrity contracts |
| Quick edit fuel record | Timeline form → fuel store update → `FuelRepository.update` | Same canonical `fuel_logs` record used by operational reconstruction | Timeline + fuel/persistence contracts |
| Delete fuel record | Confirmation → fuel store remove → `FuelRepository.remove` | Canonical fuel history and recalculated fuel totals | Verify confirmed deletion, audit trail, and consumer invalidation |

## Performance route (`/performance`)

No source-record edit form was found in the route view during this source pass. It is a read-model consumer, not a second authority: `PerformanceService` → `PerformanceRepository` plus canonical change subscriptions. Test the displayed values against source records saved by Admin, Work, and Timeline; do not add independent write paths here.

## Shared and non-routed form surfaces

| Surface | Current source finding | Follow-up |
|---|---|---|
| Universal keyboard/input runtime | `src/presentation/forms/universalFormSystem.js` tags native and contextual forms, supplies input hints, Enter navigation, viewport handling | Add runtime tests for last-field Done, select/textarea behavior, keyboard viewport, and dynamically mounted controls |
| Calculations input view | `CalculationsView.vue` saves Admin inputs via `AdminService.save` and fuel baseline via `CalculationsService.recordFuelBaseline`; not a registered route in the current router | Prove whether reachable from another active surface; if retained, add dedicated save/validation/consumer tests |
| First-run setup | `FirstRunSetupView.vue` saves source facts through `AdminService.save` and marks steps complete separately; not a registered route in current router | Prove reachability and failure recovery; step must not complete if source save fails |
| Shift reconciliation modal | Standalone `ShiftReconciliationModal.vue` native form exists; current `WorkModuleView.vue` imports `WorkContextForm.vue`, not this modal | Determine whether it is still mounted anywhere; if unreachable, classify as legacy rather than treating its contract as active UI |
| CNG fuel modal | Standalone `CngFuelModal.vue` exists; current Work route uses `WorkContextForm.vue` and does not import this modal | Determine whether any active view mounts it; align keyboard, full/partial and persistence behavior if active |
| Generic form shell / record form components | `KfeFormShell.vue`, `KfeFormField.vue`, `AuthoritativeRecordForm.vue` and related role components exist in source | Confirm imports/reachability before declaring them active; do not rebuild unused components by assumption |

## Baseline regression run and known failure

On the pre-fix implementation, the new `formSavePathRegression.contract.js` failed because `AdminSourceForm.vue` hard-coded `enterkeyhint="next"` for every non-textarea input, including the final editable input. Existing suites in the same run reported 89 passed and 1 failed (the new targeted suite). The initial run also caught an incorrect test selector in the newly written test; that assertion was corrected before recording the product defect. A minimal fix now derives `next` versus `done` from the editable-field order. CI must rerun on the fix commit before considering this defect resolved.

## Audit limits

This is source-level path tracing, not a claim that every form has been exercised in a real browser or on Android. The next test batch should add executable behavioral cases for save failure/retry, draft restore/clear timing, validation boundaries, relationship integrity, and downstream calculation invalidation per row. No unrelated business rules or fields should be invented during that work.
