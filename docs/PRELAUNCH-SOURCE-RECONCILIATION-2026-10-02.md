# KFE Pre-launch Source / Evidence Reconciliation — 2026-10-02

**Purpose:** Reconcile frozen repository rules, current `main` source, automated test evidence, and old audit/defect records before launch.
**Authority:** `KFE_BUSINESS_RULES_REGISTER.md` defines business meaning; `docs/KFE-CALCULATION-SPECIFICATION.md` defines arithmetic/data authority; `docs/KFE-ARCHITECTURE-CONTRACT.md` defines ownership and boundaries; `docs/KFE-SCREEN-CONTRACT.md` and `docs/KFE-UNIVERSAL-FORM-ACTION-RECOVERY-RULES-FROZEN.md` define screen/form/recovery acceptance.
**Baseline:** CI #2214, commit `2f49538a0f793c6bd6da0e7291b938c282382940`, [workflow run](https://github.com/amtalwalkar-sudo/KFE-New/actions/runs/36917155682), completed SUCCESS on 2026-10-01.
**Scope boundary:** Automated/repository audit only. Physical-phone acceptance, including screen-off GPS, force-stop/restart, overlay interaction under interruption, remains pending by explicit instruction. This document does not certify launch readiness.

## 1. Evidence actually verified on the green baseline

The successful run's logs establish:

- Contract runner: **71 passed, 0 failed**.
- Browser semantic Work audit: **18/18 passed**. It covered shift start/back, pickup, start ride, end ride, optional trip detail save, end shift, offline fuel, cancellation, routes, Timeline period controls/edit, Performance period controls, and Admin settings/master navigation.
- Phase 4 runtime verification: passed, including Work interactions, GPS/browser paths, theme/responsive/accessibility checks and canonical/synthetic DB isolation.
- Runtime fixture: persisted shift/trip survived reload; Timeline and Performance agreed on authoritative shift revenue under BR-11 toll treatment.
- Android build: debug APK built; the exact APK was installed/run through the Android emulator gate; WebView startup and native overlay-creation smoke tests were invoked; Android release-gate job succeeded.
- Pages deployment/runtime smoke: passed; the built PWA mounted and Work shell rendered with relative assets.
- CI artifacts included the Android debug APK, Android instrumentation logs, runtime verification bundle and Pages bundle.

These results prove the listed automated checks on that commit. They do **not** prove every Admin field has a full UI→validation→persistence→calculation→report test, every overlay gesture reaches canonical state, or background GPS works on a physical device.

## 2. Historical audit reconciliation

`KFE_BUSINESS_RULES_AUDIT.md` is a Phase 1 snapshot whose current-status text is stale. It says Business Start Date is missing, the maintenance-rate default is ₹2/km, historical maintenance recovery is missing, and BR-01 remains locked. Current source contradicts those claims:

- `src/application/admin/adminFormDefinitions.js`: required `businessSetup.businessStartDate`; `breakEvenInputs.maintenanceProvisionPerKm` default is **1.6**.
- `src/domain/performance/financePerformanceAdapter.js`: reads the configured Business Start Date and calls canonical historical-maintenance and pre-business loan recovery helpers.
- `src/domain/performance/performanceEngineV2.js`: implements historical maintenance recovery at ₹0.40/km over 12 date-to-date months.
- `src/domain/finance/loanEngine.js`: canonical pre-business loan recovery is called with Business Start Date.
- `src/tests/phase2BusinessRuleDefects.contract.js`: asserts Business Start Date authority, acquisition-date separation, ₹0.40/km / 12-month recovery, ₹1.60/km maintenance provision and origin-based pre-business loan recovery; it passed in the green contract suite.

Therefore the old BRD-002/005/007/008/009 text must not be presented as current confirmed defects. Their original finding history is retained; their current source/contract evidence is summarized above. This is not a blanket statement that all financial inputs have been validated through the production UI or against a real business dataset.

## 3. Admin form inventory and current trace status

All eleven Admin form definitions exist in `src/application/admin/adminFormDefinitions.js`. `AdminService.save` validates before save; `AdminRepository.save` revalidates, checks canonical relationships, maps records to canonical IndexedDB stores, and applies finance-specific derivations. The generic form validator trims text, rejects unknown fields, validates required values, numeric bounds, date values and allowed select values.

| Form | Defined authoritative inputs | Canonical persistence / downstream use | Current evidence and remaining gap |
|---|---|---|---|
| Business Setup | Business Start Date (required), Notes | `settings` values → finance/performance boundary and recovery calculations | Definition, validator and Phase 2 formula contract verified. Full production-form edit/reload/report trace for all fields not evidenced by the current runtime suite. |
| Vehicle | registration, make/model/variant, acquisition date/value, opening odometer, fuel type/capacity, status/dates, sale fields, active, notes | `vehicles` → active vehicle, opening-KM historical recovery, vehicle/report context | Fields and source mapping present. Not every field has a downstream calculation (many are master/display fields); no reason to invent a calculation for them. Boundary cases and edit/reload need a field matrix. |
| Driver | name, phone, licence/expiry, join date, status, assigned vehicle, notes | `drivers`; referenced by driver-target records and Admin views | Definition and relationship validation present. Complete edit/soft-delete/reference and downstream target-selection path needs explicit tests. |
| Compliance | vehicle, compliance type, valid-from/until, cost | `compliance_records` → validity and renewal provision | Required fields and date-order validation exist. Full save/edit/payment/reload/monthly provision trace not demonstrated for every field. |
| Maintenance | Date, Odometer, Maintenance, Amount, Notes | `maintenance_records` → actual maintenance cost and reporting; separate from per-KM provision | Matches the frozen five-field form. Actual-cost calculation and provision are separate authorities. Need UI persistence/edit and report-boundary regression for each field. |
| Loan | lender/reference, principal, tenure, start date, annual rate, status, notes | `loans` → EMI, outstanding position, scheduled obligation and recovery | EMI derivation and contractual-field immutability are implemented. Need complete UI save/edit/correction/period-boundary and payment interaction vectors. |
| Loan Payments | loan, actual paid date, amount, notes | `loan_payments` → EMI allocation, paid/overdue position | Allocation preview and overpayment guard present. Current generic tests prove selected validation vectors, not every schedule/date/payment replay case. |
| Prepayments | loan, date, amount, reason, notes | `prepayments` → principal/outstanding/tenure estimates | Overdue-EMI guard and estimate path present. Need end-to-end edit/correction and before/after principal report vectors. |
| Payments / Settlements | type, source type/id, payment date, amount, method/reference/notes | `settlements` → payment ledger linked to maintenance/compliance source | Source existence and cumulative-overpayment guard present. Need verify every settlement field round-trips and does not double-count source cost in reports. |
| Driver Monthly Target | driver, effective month, desired target/profit, active, notes | `driver_targets` → rolling target and recovery calculation | Definition and target calculation contracts exist. Driver scoping, effective-date boundary and active-shift progress semantics need explicit end-to-end coverage. |
| Maintenance per KM | effective date, provision per vehicle KM, notes | `break_even_inputs` → indicative/break-even maintenance provision | Default ₹1.60/km confirmed. Actual maintenance records do not replace this configured indicative rate. Need effective-date/edit/report vectors. |

**Form status:** form definitions and generic validation are present; several domain-specific rules have contracts. This does not yet meet the frozen Screen Contract for every form: valid/invalid/boundary input, busy/cancel/close, persistence, reload, edit/soft-delete, offline/recovery, and downstream calculation must be asserted per form. This is an evidence/coverage gap unless a specific failing path is demonstrated.

## 4. Calculation and authority trace

The currently declared canonical path is consistent with the frozen authority matrix for the main measures:

- Shift end revenue → `Shift.revenue` → `authoritativeShiftRevenue` / `performanceEngineV2` → Timeline/Performance/overlay. Optional `Trip.revenue` is supporting detail only.
- Vehicle KM → closing odometer − opening odometer. Business KM → completed trip KM. Dead KM → vehicle KM − business KM, subject to movement reconciliation.
- Fuel actual cost/quantity → `fuel_logs`; quantity derives from amount ÷ price/kg; full/partial tank affects qualifying fuel-efficiency evidence.
- Actual maintenance → actual maintenance records. Indicative maintenance provision → vehicle KM × effective configured maintenance rate. These must not be conflated.
- Compliance provision → cost/validity-day allocation.
- Loan position/EMI → canonical loan engine plus actual loan payments and prepayments.
- Performance Actual P/L → actual operating profit less full scheduled EMI for selected period. Provisional P/L additionally subtracts the applicable maintenance/compliance provisions and pre-business/historical recovery.
- Driver target → authoritative monthly break-even + configured desired driver profit + finalized prior recovery and KM multiplier.

The green tests exercise deterministic vectors and selected cross-surface fixtures. They do not constitute exhaustive data-driven proof of all possible combinations, nor prove every Admin form field changes every relevant report correctly. A separate field-to-calculation vector matrix remains required before claiming complete end-to-end financial verification.

## 5. Current confirmed gaps from source/test comparison

### P0 — Native overlay fare identity fix proposed; Golden Ride acceptance remains open

- `src/infrastructure/android/androidOverlayLifecycle.js` finds a completed trip with missing optional fare and passes `pendingFareId` to `deriveWorkCockpitState`.
- The defect was that the cockpit discarded `pendingFareId` and the native overlay reused one trip ID for both the current swipe action and optional fare submission.
- The proposed branch carries `pendingFareId` through canonical cockpit state and overlay payload, uses a separate native `pendingFareTripId`, and persists `fareDetailsSkipped` so a skipped optional form does not remain pending forever.
- Android instrumentation has deterministic guard assertions, but it still does not execute the complete END → save/skip → next pickup flow or process interruption/replay.

**Disposition:** source fix is proposed on `audit/fix-overlay-fare-gps-race`; CI and full exact-APK Golden Ride/interruption-replay acceptance must pass before closure. Optional fare detail must remain non-blocking for next pickup and shift closure.

### P1 — Active-shift target progress is not supported by the authoritative revenue snapshot

- `PerformanceService.getDailyTargetSnapshot()` returns `achieved: Number(metrics?.revenue || 0)`.
- `authoritativeShiftRevenue` sums completed shifts' shift-end revenue; the active shift's authoritative revenue is not committed until End Shift.
- `WorkModuleView.vue` computes target progress from that snapshot and refreshes it on mount and selected fare-detail paths, not on a canonical live-revenue event.
- Optional trip fares cannot be substituted as authoritative shift revenue under the register.

**Disposition:** confirmed product/business-rule gap, but the interim progress definition requires a deliberate rule decision. Do not silently make optional trip fares authoritative. The UI needs a frozen rule for what “achieved” means during an active shift.

### P1 — Native GPS stop identity guard proposed; regression gate pending

- `WorkService.completeTrip()` still asynchronously syncs the completed trip trace and calls `NativeGpsService.stop(oldTripId)`.
- The proposed `KfeNativeGpsService` compares requested and current/persisted active trip IDs before stopping; a stale mismatched stop leaves the newer collector untouched.
- An Android instrumentation assertion covers matching, stale and empty IDs. It is a deterministic guard test, not a physical-device interleaving test.

**Disposition:** source fix is proposed on the branch; CI must pass the guard test. Real background GPS acceptance remains pending phone testing.

### P1 — Android Golden Ride and replay coverage is incomplete

The Android smoke tests cover bundled WebView mount and native overlay creation. They do not execute the full action loop, verify persisted PWA/overlay parity, or simulate duplicate/replayed actions and interruption between END and optional fare entry. The CI green result must not be interpreted as coverage of those cases.

**Disposition:** confirmed test-coverage gap; build automated emulator tests for overlay pickup/start/end/cancel/fare actions, canonical record counts, duplicate delivery, process recreation, pending-action consumption/clear, and return to next pickup.

### P2 — Presentation modernization is guarded, not automated

`npm run ui:impact -- <src/path>` is an impact/dependency guard. It does not modernize or replace an arbitrary screen in one command. The presentation boundary helps isolate changes, but the requested one-command modernization workflow does not currently exist.

**Disposition:** tooling/product gap; keep separate from business logic and implement only after the functional release gate is clean.

### Deferred — physical-device GPS/overlay acceptance

Native foreground GPS service and live-KM overlay update paths exist in source; CI checks build and selected emulator smoke behavior. No repository test can establish reliable location capture during real screen-off/background operation across device power management, permission state, app swiping/force-stop, OEM restrictions and resume. Per user instruction this remains pending phone testing.

## 6. Re-audit disposition for old defect candidates

| Old candidate | Current disposition |
|---|---|
| BRD-CAND-001 arbitrary trip stage | **Verified fixed in source/contract**: repository calls domain `transitionTripStage`; canonical lifecycle contract passed. |
| BRD-CAND-002 END→fare interruption/replay | **OPEN**: pending-action/replay path still lacks full Android Golden Ride coverage; related fare-state wiring defect confirmed above. |
| BRD-CAND-003 Android Golden Ride gate | **OPEN**: current gate is only WebView/overlay smoke, not full lifecycle/replay. |
| BRD-CAND-006 latest-main/deploy evidence | **Verified for baseline only** by CI #2214 (run link above); must be rechecked for any later release commit. |
| BRD-CAND-007 GPS phase switch | **Source/contract present; device acceptance pending**. Do not call background GPS fully verified. |
| BRD-CAND-008 Android gate false-success reporting | **Green baseline gate succeeded**; retain logs and require instrumentation result codes. |
| BRD-CAND-009 overlay revenue authority | **Source/contract verified**: overlay mirrors shift revenue, not summed trip fares. |
| BRD-CAND-010 overlay theme | **Source mapping present**: theme controller resolves to day/night and native overlay maps day/night palettes; verify on device after any theme changes. |
| BRD-CAND-011 blank cancellation revenue | **Source/contract verified**: blank cancellation revenue normalizes to zero. |
| BRD-CAND-012 active target progress | **OPEN**, confirmed by source trace; needs explicit rule decision plus test. |
| BRD-CAND-013 background live-KM refresh | **Source path present; phone/background acceptance pending**. |
| BRD-CAND-014 one-command modernization | **OPEN tooling gap**, accurately described as not implemented. |
| BRD-CAND-015 native overlay fare capture | **OPEN / confirmed release blocker**, source trace above. |
| New: stale stop can terminate next trip GPS | **OPEN / confirmed by source trace**, add identity guard and deterministic race test. |
| New: complete per-field Admin downstream trace | **OPEN evidence gap**, not proof every form is functionally broken. |

## 7. Coordinated next gate (no speculative redesign)

1. Fix the confirmed overlay fare-state wiring and native GPS stop-identity race; add focused deterministic contracts first.
2. Add Android emulator Golden Ride tests for the complete overlay action loop, persisted canonical parity, duplicate/replayed action delivery, and process interruption/recovery.
3. Build a table-driven Admin field matrix for all 11 forms: required/optional, invalid/boundary values, relationships, create/edit/soft-delete, reload/recovery, persistence identity, and downstream metric/report changes.
4. Add calculation vectors for each source field that materially affects economics, with IST day/month boundaries, zero/missing/incomplete evidence, loan/payment timing, maintenance actual-vs-provision separation, toll/parking treatment, and no double counting.
5. Reconcile the old audit ledger to these statuses; do not treat stale Phase 1 findings as current.
6. Run one coordinated regression → exact APK emulator gate → Pages artifact/runtime gate → deploy → refresh-route check. Only then report automated release status.
7. Keep real-phone screen-off/background GPS and overlay interruption scenarios **PENDING DEVICE ACCEPTANCE**.

**Current conclusion:** CI #2214 is the green baseline. The overlay fare identity and GPS stop identity fixes are proposed on branch `audit/fix-overlay-fare-gps-race` and are not yet verified by CI. KFE is **not yet launch-ready** until that branch passes CI, Golden Ride/replay coverage is expanded, and the per-field downstream matrix is exercised. Physical-phone GPS acceptance remains explicitly pending.
