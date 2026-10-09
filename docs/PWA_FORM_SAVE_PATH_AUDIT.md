# PWA Form-by-Form Save-Path Audit

Audit baseline: `main` at `931d8bb18c6337dbe8b229298e7abc24dc9ea25a` (2026-10-09).
Scope: routed PWA surfaces plus setup, settings, and form-capable secondary views. This is a source-trace audit, not a claim of physical-device testing.

## Active PWA form matrix

| Surface / form | Validation and submit boundary | Canonical persistence | Calculation / read-model consumers | Draft / failure behavior | Audit status |
|---|---|---|---|---|---|
| Admin — Business Setup | `AdminSourceForm` → `AdminView` → `AdminService.save` → `validateAdminForm` | `AdminRepository` → `settings` record keyed `businessSetup`; mutation + audit history | Performance snapshot selects latest non-deleted businessSetup setting; business start date bounds reporting periods and related calculations | Shared `FormDraftService`; parent must clear only after save succeeds or confirmed discard | Source path present; verify field-level business date normalization/IST in runtime |
| Admin — Vehicle | Same Admin shared path | `vehicles` | Performance / calculations vehicle and opening odometer, fuel type and active lifecycle | Shared form draft | Source path present; legacy vehicle module also exists but is not in router |
| Admin — Driver | Same Admin shared path | `drivers` | Work operator/assignment and driver-target calculations | Shared form draft | Source path present |
| Admin — Compliance | Same Admin shared path | `compliance_records` | Compliance status/history and expense/settlement-related views where read | Shared form draft | Source path present; a separate legacy `ComplianceModuleView` uses a different save-request event and is not routed |
| Admin — Maintenance | Same Admin shared path | `maintenance_records` | Actual maintenance expense / actual P&L; maintenance-per-KM planning input is separate under Break-even inputs | Shared form draft | Source path present; field contract should remain Date, Odometer, Maintenance, Amount, Notes |
| Admin — Loan | Same Admin shared path | `loans` | Loan engine, EMI/loan position, finance and performance snapshots | Shared form draft | Source path present |
| Admin — Loan Payments | Same Admin shared path | `loan_payments` | Loan position/payment allocation and finance read models | Shared form draft | Source path present |
| Admin — Prepayments | Same Admin shared path | `prepayments` | Loan engine prepayment estimate/position and finance views | Shared form draft | Source path present |
| Admin — Settlements | Same Admin shared path | `settlements` | Settlement / expense history and financial read models | Shared form draft | Source path present |
| Admin — Driver Target | Same Admin shared path | `driver_targets` | Driver target and performance calculations | Shared form draft | Source path present |
| Admin — Break-even inputs | Same Admin shared path | `break_even_inputs` | Indicative break-even/target calculations; fixed maintenance-per-KM input, not actual maintenance rows | Shared form draft | Source path present |
| First-run setup source steps | `AdminSourceForm` → `AdminService.save`; separate `FirstRunSetupService.setStepState` | Same canonical Admin stores; step completion is setup state | Same consumers as corresponding Admin forms | Shared form draft; optional setup steps can be skipped; cloud backup step has a separate config save and performs a backup verification | Source path present; cloud flow needs integration/runtime test |
| First-run historical records | Separate step, not a normal Admin definition form | Must be traced through the specific historical-record entry path before assuming canonical write | Compliance and actual maintenance consumers | Verify per selected entry path | Not fully evidenced by the source checks; do not treat as passed |
| First-run fuel baseline | Instruction points users to Work fuel entry; not an independent canonical form in the setup step list | Work fuel path → `fuel_logs` | Performance, Timeline, fuel evidence and operating-cost calculations | Work draft rules apply when entered in Work | No separate form save path claimed |
| First-run cloud backup | Backup config save then `CloudBackupLifecycle.backupToConfiguredCloud()` | Backup configuration + exported backup lifecycle | Recovery / backup only, not operational calculations | Errors surfaced by setup flow | Source path present; live cloud provider not exercised here |
| Work — Start Shift / odometer gap | `WorkModuleView` → shift store → `WorkService.startShift` | `ShiftTripRepository.createShift` → canonical `shifts` | Work state, trip allocation, performance, timeline, daily target and KM calculations | Work draft identity scoped to start-shift workflow; clear after successful commit | Source path present; verify odometer-gap edge cases with tests |
| Work — Trip details / fare / toll / parking | Work form → `store.updateTrip` → Work service/repository | Existing canonical `trips` record | Shift review, Timeline authoritative revenue display where present, performance/revenue reconciliation; toll/parking treatment must avoid double counting | Trip-scoped draft; explicit skipped-fare terminal flag; clear after successful update | Source path present |
| Work — Cancellation | Work form → `store.cancelTrip` → canonical trip lifecycle/repository | Existing trip's cancellation fields/status | Work lifecycle and Timeline; blank cancellation fee normalizes to numeric 0; cancellation amount does not replace authoritative shift revenue | Trip-scoped draft; clear after successful transition | Source path present; explicit blank-vs-zero regression coverage exists |
| Work — Fuel | Work form → `WorkService.recordFuel` → `FuelRepository.create` | `fuel_logs` | Performance snapshot, Timeline fuel edits/history, fuel/operating cost calculations | Shift/workflow-scoped draft; full/partial tank value stored | Source path present |
| Work — End Shift / reconciliation / review | Work form → shift store → end-shift domain flow | `ShiftTripRepository.completeShift` → canonical `shifts`; shift revenue is authoritative | Performance, Timeline, finance and revenue reconciliation; shift-level toll/parking are additional-only | Shift-scoped draft; commit only at final submit; clear after successful completion | Source path present; test retries and duplicate-submit behavior |
| Timeline — trip edit | Timeline editor → `WorkService` / canonical trip update | Existing canonical `trips` record | Timeline and performance read models | `FormDraftService`, trip-scoped; queue awaited before clearing on commit | Source path present |
| Timeline — fuel edit | Timeline editor → fuel-store/repository update | Existing canonical `fuel_logs` record | Timeline and performance/fuel calculations | `FormDraftService`, fuel-record-scoped | Source path present |
| Calculations — Admin source edits | Uses `ADMIN_FORM_DEFINITIONS` and `AdminService` for Business Setup, Vehicle, Driver, Break-even inputs, Driver Target and Loan | Same canonical stores as Admin | Calculation preview via `PerformanceService` / `CalculationsService` | Shared form draft boundary | Source path present; must not introduce duplicate calculations in UI |
| Calculations — manual fuel input | Fuel field definition is present in view; save path must be confirmed for each submit handler before treating it as authoritative evidence | Expected canonical fuel path only if handler reaches Work fuel service/repository | Fuel calculation previews | Verify draft and commit behavior | Needs a dedicated runtime/save-path test |
| Settings — backup export / restore | `KfeSettingsView` → application `exportBackup` / `restoreBackup` | Backup serialization and restore pipeline, not an operational source record | Recovery only | Restore requires confirmation; success/error feedback; reload after success | Source path present; destructive restore not device-tested |
| Settings — reset | `KfeSettingsView` → application `resetAllData` after two confirmations | Canonical local data reset | All operational consumers affected | Double confirmation and error state | Source path present; destructive reset not device-tested |

## Alternate / legacy form implementations

The source tree also contains `VehicleModuleRole`, `MaintenanceModuleRole`, `LoanModuleRole`, `ComplianceModuleView`, `KfeFormShell`, and `AuthoritativeRecordFormRole`. The current router registers only Work, Timeline, Performance, and Admin. These alternate components are therefore not proven to be active route-level forms. Their persistence contracts differ (for example, some emit `save-request` to a parent; `KfeFormShell` uses `js/ui/form-drafts.js`, separate from the current IndexedDB form draft service). Do not silently merge these paths or claim them as the active Admin replacement. If any are reachable through a parent modal/slot, trace that caller separately before deleting or changing them.

## Save-to-consumer chain

- Admin source forms: field definition → universal normalization/validation → `AdminService` → `AdminRepository` canonical store → mutation/audit record → performance/calculation read model.
- Work shift/trip: form state → shift store → Work application service → `ShiftTripRepository` / lifecycle → `shifts` and `trips` → Timeline/Performance/target/reconciliation consumers.
- Fuel: Work form → Work fuel service → fuel repository → `fuel_logs` → Performance/Timeline/cost consumers.
- Timeline edits: editor draft → canonical trip/fuel update → read-model refresh; draft clear follows successful commit.
- Settings backup/reset: application lifecycle boundary; not part of normal revenue/expense entry.

## Baseline test evidence and limitations

- First targeted PR run: 91 contract suites passed; the new matrix contract failed at its assertion that `CalculationsService` delegates to `PerformanceService`. Inspection showed the assumption was wrong: the service owns validation for the manual fuel baseline and writes canonical evidence through `FuelRepository.create`, deriving quantity from amount / price-per-kg. The assertion was corrected to test that actual save path. This was a test failure, not a confirmed product defect.
- Existing main CI at the audit baseline completed successfully (run [37960126493](https://github.com/amtalwalkar-sudo/KFE-New/actions/runs/37960126493)). This proves the currently registered contract suite passed, not that every possible form path has runtime coverage.
- Existing `pwaFormSavePathRegression.contract.js` and `formIntegrityE2E.contract.js` are source-contract checks, not browser-driven E2E tests.
- This audit has not run a local npm test process because the execution environment could not clone the repository. The new targeted contract will run in GitHub Actions before implementation changes.
- No Android device, keyboard/viewport, offline/restart, or live cloud restore test is claimed.
