# PWA Form-by-Form Save-Path Audit Matrix

**Audit baseline:** `main` at `1b5ca3186c5b8aa43f08b115da063a9ad5c40456`.  
**Scope:** active Admin, first-run, Work, backup/settings/calculation surfaces and form-like secondary module components found in the PWA source tree.  
**Method:** source tracing plus a regression contract. Source wiring is not browser/device runtime proof.

## Form matrix

| Form / surface | Validation | Save path / persistence | Downstream consumers | Status |
|---|---|---|---|---|
| First-run Business Setup | Admin universal rules; business start date required | FirstRunSetupView → AdminService.save → AdminRepository; FirstRunSetupService separately records step state | Business-period boundaries; Performance/Timeline calculations | Source traced; failure injection pending |
| First-run Vehicle | Admin universal rules | Same Admin save path + step state | Work opening odometer; vehicle/cost calculations | Source traced |
| First-run Driver | Admin universal rules | Same Admin save path + step state | Work operator options; driver target | Source traced |
| First-run Break-even inputs | Admin universal rules | Same Admin save path + step state | Indicative breakeven/target calculations | Source traced |
| First-run Driver target | Admin universal rules | Same Admin save path + step state | Target/progress and performance views | Source traced |
| First-run Loan | Admin universal rules | Same Admin save path + step state | EMI, loan position, pre-business recovery | Source traced |
| First-run History | Step state only; records entered later in Admin | FirstRunSetupService | Compliance and actual maintenance expense reporting | Not a source-record form |
| First-run Fuel baseline | Step state only; real refill entered in Work | FirstRunSetupService | Fuel evidence and cost/km | Not a fuel-record form |
| First-run Cloud Backup | Token required when enabled; first cloud backup must verify | BackupConfig → CloudBackupLifecycle → setup step state | Backup schedule/recovery | Source traced; provider runtime test pending |
| Admin Business Setup | AdminService + universalFormRules | AdminView → AdminService.save → AdminRepository → canonical settings/source record + mutation/audit | Business period boundaries and calculations | Source traced |
| Admin Vehicle | Same | Canonical vehicle record | Work odometer baseline; vehicle and cost calculations | Source traced |
| Admin Driver | Same | Canonical driver record | Work operator/driver target | Source traced |
| Admin Compliance | Same | Canonical compliance record | Validity/cost reporting | Source traced |
| Admin Maintenance | Same | Canonical maintenance record | Actual profit expense and maintenance history; separate from indicative maintenance/km input | Source traced |
| Admin Loan | Same | Canonical loan record | EMI, loan position, pre-business recovery | Source traced |
| Admin Loan Payment | Same | Actual loan-payment record | Actual payment/loan reconciliation | Source traced |
| Admin Prepayment | Same | Prepayment record | Loan balance/timeline | Source traced |
| Admin Payment/Settlement | Same | Settlement record | Settlement and expense-payment history | Source traced |
| Admin Driver Target | Same | Target record | Daily target/performance views | Source traced |
| Admin Break-even Planning Inputs | Same | Effective-dated planning record | Indicative breakeven/target calculations | Source traced |\n| Admin quick Driver Target editor | Target/driver checks and AdminService validation | AdminView → AdminService.save('driverTarget') → AdminRepository | Target/progress and performance views | Source traced |\n| Admin quick Maintenance-per-KM editor | Non-negative rate check and AdminService validation | AdminView → AdminService.save('breakEvenInputs') → AdminRepository | Indicative planning calculations only | Source traced |\n| Admin loan-payment action | Payment allocation preview/confirmation; AdminService validation | AdminView → AdminService.save('loanPayment') → AdminRepository | Actual loan payment/loan position | Source traced |\n| Admin source-payment action | Source record, date, amount, method; AdminService validation | AdminView → AdminService.save('settlement') → AdminRepository | Actual maintenance/compliance settlement | Source traced |\n| Admin prepayment action | Estimate and explicit confirmation before save | AdminView → AdminService.save('prepayment') → AdminRepository | Loan balance/timeline | Source traced |
| Work Start Shift / odometer gap | Work/domain validation | WorkModuleView → shift store → WorkService → ShiftTripRepository → canonical shift; temporary draft separate | Shift KM, gap allocation, Work cockpit | Source traced; mobile keyboard runtime pending |
| Work trip start/operator | Operator validation in WorkService/domain | Shift store → WorkService → ShiftTripRepository | Trip state, Timeline, GPS enrichment | Source traced; GPS must remain non-blocking |
| Work trip fare/details | Trip correction/form handling | WorkModuleView → shift store updateTrip → WorkService → ShiftTripRepository | Timeline/performance supporting detail; End Shift revenue remains authoritative | Source traced |
| Work cancellation | Lifecycle validation; blank fee defaults to zero | WorkModuleView → shift store cancelTrip → canonical trip repository | Trip lifecycle/timeline; fee is not shift-revenue authority | Source traced |
| Work fuel | Fuel validation and quantity calculation | WorkModuleView → WorkService → FuelRepository → `fuel_logs` | Fuel history and fuel cost/km | Source traced |
| Work End Shift / reconciliation | Reconciliation and movement-allocation validation | WorkModuleView → shift store → endShift → ShiftTripRepository.completeShift | Authoritative shift revenue, shift/dead KM, Timeline/Performance | Source traced |
| Work form drafts | Parent/step identity and guarded clear | FormDraftRepository → separate `form_drafts`; clear only after commit or confirmed discard | Restore unfinished forms after navigation/restart | Source traced; actual WebView kill/restart pending |
| Admin Backup & Restore | Backup validation/confirmation | BackupRestorePanel → BackupService → backup repository | Local recovery/data integrity | Wiring traced; round-trip runtime pending |
| Settings Backup/Restore/Reset | JSON parsing and explicit confirmation | KfeSettingsView → application export/restore/reset boundary | Canonical data recovery/reset | Wiring traced; destructive/round-trip runtime pending |
| Calculations / diagnostics — source inputs | Admin universal rules | CalculationsView → AdminService.save(openId, values) → AdminRepository | Business setup, vehicle, driver, planning inputs and loans | Source traced |\n| Calculations fuel baseline | Odometer, price/kg and amount must be finite/positive; partial/full tank flag | CalculationsView → CalculationsService.recordFuelBaseline → FuelRepository → fuel_logs | Fuel evidence and cost/km calculation | Source traced |\n| Calculations / diagnostics — read-only panels | N/A | CalculationsView → PerformanceService / CalculationsService | Calculation snapshots, target/breakeven/profit | Source path traced; rendered runtime checks in CI |

## Secondary / legacy module components found

The current router exposes four routes: Work (`/`), Timeline (`/timeline`), Performance (`/performance`), and Admin (`/admin`). `FirstRunSetupView` is conditionally rendered by App when `VITE_ENABLE_FIRST_RUN_SETUP=true`. The tree also contains `ComplianceModuleView`, `VehicleModuleView`, `MaintenanceModuleView`, `LoanModuleView`, `KfeFinancialModuleView`, `AuthoritativeRecordForm`, `FuelForm`, `KfeFormShell`, and Role/FuelEntryForm implementations, but these are **not direct router routes** in the current router. They are legacy/secondary components and are not counted as active screens unless a current parent imports/mounts them. The new regression contract guards this route inventory.

## Consumer map

- **Admin source records →** AdminRepository/IndexedDB → PerformanceRepository snapshots → PerformanceService calculations → Performance/Timeline views.
- **Shift/trip records →** ShiftTripRepository → Work state and Timeline. Completed shift revenue is authoritative; trip fare is optional supporting detail.
- **Fuel records →** FuelRepository `fuel_logs` → Performance calculation snapshot and fuel cost metrics.
- **Maintenance records →** canonical maintenance records → actual expenses/profit. Effective-dated maintenance-per-km is a separate indicative planning input.
- **Loan/payment/prepayment records →** canonical Admin records → loan engine and finance/performance read models.
- **Drafts →** separate temporary `form_drafts` store; drafts are not authoritative business records.

## Regression-first test status

`src/tests/pwaFormSavePathRegression.contract.js` checks form inventory, validation boundaries, persistence routing, draft safety, backup boundaries, and calculation/read-model consumers. It is wired into the full contract runner. Initial CI attempts exposed **test-harness assertion mismatches** (the Admin handler passes `selected.value,payload,id`, and BackupService calls `createBackupRepository(CANONICAL_BACKUP_STORES)`); these were corrected. Those failures were not evidence of product defects. Final rerun result must be appended after CI completes.

## Limits / next test tier

1. This matrix traces source code; it does not prove every field works under a real mobile keyboard.
2. A second tier should instantiate services with isolated IndexedDB and inject validation errors, transaction aborts, quota errors, reloads and duplicate submissions.
3. Device/WebView tests are needed for restart recovery, keyboard visibility, and Android/PWA parity.
4. This audit-first change contains no implementation fixes.
