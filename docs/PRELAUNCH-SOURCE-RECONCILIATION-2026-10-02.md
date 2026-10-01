# KFE Pre-launch Source / Evidence Reconciliation — 2026-10-02

**Purpose:** Reconcile frozen repository rules, current `main` source, automated test evidence, and old audit/defect records before launch.
**Authority:** `KFE_BUSINESS_RULES_REGISTER.md` defines business meaning; `docs/KFE-CALCULATION-SPECIFICATION.md` defines arithmetic/data authority; `docs/KFE-ARCHITECTURE-CONTRACT.md` defines ownership and boundaries; `docs/KFE-SCREEN-CONTRACT.md` and `docs/KFE-UNIVERSAL-FORM-ACTION-RECOVERY-RULES-FROZEN.md` define screen/form/recovery acceptance.
**Latest verified automated baseline:** CI #2227, commit `32db1fec882d4a06aa12a72e458dc4f5fbd76b33`, [workflow run](https://github.com/amtalwalkar-sudo/KFE-New/actions/runs/36930272579), completed SUCCESS on 2026-10-01. This is an automated/non-phone pass, not launch acceptance.
**Scope boundary:** Automated/repository audit only. Physical-phone acceptance, including screen-off GPS, force-stop/restart, overlay interaction under interruption, remains pending by explicit instruction. This document does not certify launch readiness.

## 1. Evidence actually verified on the green baseline

The successful run's logs establish:

- Contract runner: **72 suites passed, 0 failed**. The added `adminFieldMatrix.contract.js` exercises **11 Admin forms / 69 defined fields** for required-field rejection, invalid dates/numbers, numeric bounds, allowed selections, text normalization and selected cross-field rules. It does not yet prove full UI save/edit/reload/recovery/downstream calculation for every field.
- Browser semantic Work audit: **18/18 passed**. It covered shift start/back, pickup, start ride, end ride, optional trip detail save, end shift, offline fuel, cancellation, routes, Timeline period controls/edit, Performance period controls, and Admin settings/master navigation.
- Phase 4 runtime verification: passed, including Work interactions, GPS/browser paths, theme/responsive/accessibility checks and canonical/synthetic DB isolation. The browser semantic Work audit passed **18/18** scenarios.
- Runtime fixture: persisted shift/trip survived reload; Timeline and Performance agreed on authoritative shift revenue under BR-11 toll treatment.
- Android build: exact debug APK was built and installed on the CI emulator; WebView startup test passed (1 test), and native overlay smoke suite passed (3 tests, including fare-trip identity fallback and stale GPS-stop identity guards). The Android gate now requires the exact terminal result `INSTRUMENTATION_CODE: -1` and the expected per-class test counts (1 and 3), rather than accepting a broad status-code substring. The tested APK SHA-256 is recorded in the `kfe-android-golden-gate-identity` artifact. This is not the full Golden Ride/replay test.
- Pages deployment/runtime smoke: passed. Work route returned HTTP 200; `/timeline`, `/performance`, and `/admin` returned HTTP 404 from GitHub Pages but the SPA fallback mounted each corresponding visible route successfully. This verifies the current fallback UI, not an HTTP-200 deep-route response.
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

### P0 — Native overlay fare identity source fix present; Golden Ride acceptance remains open

- `src/infrastructure/android/androidOverlayLifecycle.js` finds a completed trip with missing optional fare and passes `pendingFareId` to `deriveWorkCockpitState`.
- The defect was that the cockpit discarded `pendingFareId` and the native overlay reused one trip ID for both the current swipe action and optional fare submission.
- Current `main` carries `pendingFareId` through canonical cockpit state and overlay payload, uses a separate native `pendingFareTripId`, and persists `fareDetailsSkipped` so a skipped optional form does not remain pending forever. The native fare submission now resolves the completed trip ID first and falls back to the current trip ID only when no pending-fare ID is available; an emulator regression assertion covers both paths.
- Android instrumentation has deterministic guard assertions, but it still does not execute the complete END → save/skip → next pickup flow or process interruption/replay.

**Disposition:** source-level identity fix and deterministic ID fallback test are present on `main` and passed CI #2227. Full exact-APK Golden Ride/interruption-replay acceptance remains open. Optional fare detail must remain non-blocking for next pickup and shift closure.

### P1 — Active-shift target progress is not supported by the authoritative revenue snapshot

- `PerformanceService.getDailyTargetSnapshot()` returns `achieved: Number(metrics?.revenue || 0)`.
- `authoritativeShiftRevenue` sums completed shifts' shift-end revenue; the active shift's authoritative revenue is not committed until End Shift.
- `WorkModuleView.vue` computes target progress from that snapshot and refreshes it on mount and selected fare-detail paths, not on a canonical live-revenue event.
- Optional trip fares cannot be substituted as authoritative shift revenue under the register.

**Disposition:** confirmed product/business-rule gap, but the interim progress definition requires a deliberate rule decision. Do not silently make optional trip fares authoritative. The UI needs a frozen rule for what “achieved” means during an active shift.

### P1 — Native GPS stop identity guard present; regression gate pending

- `WorkService.completeTrip()` still asynchronously syncs the completed trip trace and calls `NativeGpsService.stop(oldTripId)`.
- `KfeNativeGpsService` compares requested and current/persisted active trip IDs before stopping; a stale mismatched stop leaves the newer collector untouched.
- An Android instrumentation assertion covers matching, stale and empty IDs. It is a deterministic guard test, not a physical-device interleaving test.

**Disposition:** source guard and deterministic emulator assertion are on `main` and passed CI #2227. Real background GPS acceptance remains pending phone testing.

### P1 — Android Golden Ride and replay coverage is incomplete

The Android smoke tests cover bundled WebView mount and native overlay creation. They do not execute the full action loop, verify persisted PWA/overlay parity, or simulate duplicate/replayed actions and interruption between END and optional fare entry. The CI green result must not be interpreted as coverage of those cases.

**Disposition:** confirmed test-coverage gap; build automated emulator tests for overlay pickup/start/end/cancel/fare actions, canonical record counts, duplicate delivery, process recreation, pending-action consumption/clear, and return to next pickup.

### P2 — Presentation modernization is guarded, not automated

`npm run ui:impact -- <src/path>` is an impact/dependency guard. It does not modernize or replace an arbitrary screen in one command. The presentation boundary helps isolate changes, but the requested one-command modernization workflow does not currently exist.

**Disposition:** tooling/product gap; keep separate from business logic and implement only after the functional release gate is clean.

### Deferred — physical-device GPS/overlay acceptance

Native foreground GPS service and live-KM overlay update paths exist in source; CI checks build and selected emulator smoke behavior. No repository test can establish reliable location capture during real screen-off/background operation across device power management, permission state, app swiping/force-stop, OEM restrictions and resume. Per user instruction this remains pending phone testing.

## 5A. Additional source checks against frozen requirements

- **Fuel full/partial entry:** the Work form starts with the odometer blank; the Partial fill checkbox inversely maps to canonical `isFullTank`; quantity remains calculated from amount ÷ price/kg; the repository validates the derived quantity and persists the tank classification. The source path is present. The 18-case semantic browser audit does not by itself prove every full/partial persistence and reload vector, so include those in the field matrix.
- **Finance Ledger:** the read-only Admin Ledger component exists and offers Day/Week/Month navigation for Toll, Parking and Fuel. It builds rows from persisted shift and fuel records rather than replacing history with aggregate-only rows. **Unverified boundary:** the component currently chooses `shiftEndAt` before `shiftStartAt` for Toll/Parking dates. Add an overnight-shift test and reconcile this with the frozen “authoritative shift date” rule before declaring date semantics complete.
- **Semantic theme colours:** global CSS defines light/dark semantic tokens for info/success/warning/danger, and Work semantic colours consume those tokens. The native overlay separately maps the same semantic states to Java colour constants by theme. Theme adaptation exists, but cross-platform palette parity is duplicated rather than driven from one generated token source; emulator smoke does not verify the complete light/dark overlay palette. Treat this as a consistency/test gap, not evidence that all theme colours are broken.
- **Timer and GPS:** the native foreground location service persists trip-keyed points locally; the overlay timer derives elapsed time from the persisted trip-start timestamp and schedules redraws while a ride is active. The CI emulator verifies interface startup and overlay creation, not location capture through a real screen-off/background interval. Physical acceptance remains deferred by the launch plan.
- **Presentation-only redesign:** `npm run ui:impact -- <src/path>` reports dependents and protected-layer impact. It is not an automatic one-command screen modernization tool. A true one-command redesign workflow is not implemented.
- **Release sequencing:** CI is green, but Phase 11 remains ACTIVE until real controlled-pilot evidence is recorded. CI or synthetic data cannot close that gate. Phase 12 reconciliation and Phase 13 final release remain locked/pending under the master plan.

## 6. Re-audit disposition for old defect candidates

| Old candidate | Current disposition |
|---|---|
| BRD-CAND-001 arbitrary trip stage | **Verified fixed in source/contract**: repository calls domain `transitionTripStage`; canonical lifecycle contract passed. |
| BRD-CAND-002 END→fare interruption/replay | **OPEN**: source-level fare identity guard is present, but pending-action/replay still lacks full Android Golden Ride coverage. |
| BRD-CAND-003 Android Golden Ride gate | **OPEN**: current gate is only WebView/overlay smoke, not full lifecycle/replay. |
| BRD-CAND-006 latest-main/deploy evidence | **Verified for baseline only** by CI #2227 (run link above); must be rechecked for any later release commit. |
| BRD-CAND-007 GPS phase switch | **Source/contract present; device acceptance pending**. Do not call background GPS fully verified. |
| BRD-CAND-008 Android gate false-success reporting | **Corrected and verified in CI #2227**: exact terminal instrumentation result and expected test counts are required; retain logs. |
| BRD-CAND-009 overlay revenue authority | **Source/contract verified**: overlay mirrors shift revenue, not summed trip fares. |
| BRD-CAND-010 overlay theme | **Source mapping present**: theme controller resolves to day/night and native overlay maps day/night palettes; verify on device after any theme changes. |
| BRD-CAND-011 blank cancellation revenue | **Source/contract verified**: blank cancellation revenue normalizes to zero. |
| BRD-CAND-012 active target progress | **OPEN**, confirmed by source trace; needs explicit rule decision plus test. |
| BRD-CAND-013 background live-KM refresh | **Source path present; phone/background acceptance pending**. |
| BRD-CAND-014 one-command modernization | **OPEN tooling gap**, accurately described as not implemented. |
| BRD-CAND-015 native overlay fare capture | **OPEN / confirmed release blocker**, source trace above. |
| New: stale stop can terminate next trip GPS | **Source guard and deterministic test present**; verify on current CI; device interleaving remains pending. |
| New: complete per-field Admin downstream trace | **OPEN evidence gap**, not proof every form is functionally broken. |

## 7. Coordinated next gate (no speculative redesign)

1. Keep the existing source-level fare-identity and GPS stop-identity guards; extend their deterministic checks into an Android emulator Golden Ride test for the complete overlay action loop, persisted canonical parity, duplicate/replayed action delivery, and process interruption/recovery.
3. Build a table-driven Admin field matrix for all 11 forms: required/optional, invalid/boundary values, relationships, create/edit/soft-delete, reload/recovery, persistence identity, and downstream metric/report changes.
4. Add calculation vectors for each source field that materially affects economics, with IST day/month boundaries, zero/missing/incomplete evidence, loan/payment timing, maintenance actual-vs-provision separation, toll/parking treatment, and no double counting.
5. Reconcile the old audit ledger to these statuses; do not treat stale Phase 1 findings as current.
6. Run one coordinated regression → exact APK emulator gate → Pages artifact/runtime gate → deploy → refresh-route check. Only then report automated release status.
7. Keep real-phone screen-off/background GPS and overlay interruption scenarios **PENDING DEVICE ACCEPTANCE**.

**Current conclusion:** CI #2227 passed on `32db1fec882d4a06aa12a72e458dc4f5fbd76b33`: 72 contract suites, Android exact-APK smoke, and deployment/runtime checks all succeeded. The added Admin field validation matrix passed for 11 forms and 69 fields, but full per-field UI persistence/edit/recovery/downstream calculation remains open. The source-level overlay fare identity and GPS stop-identity guards and their deterministic emulator assertions passed. Full Golden Ride/replay remains open. Active-shift target progress still needs an explicit business-rule decision. Deep routes render through GitHub Pages fallback but still return HTTP 404. Physical-phone GPS/overlay acceptance remains explicitly pending. KFE is **not yet launch-ready** on the evidence currently available.
