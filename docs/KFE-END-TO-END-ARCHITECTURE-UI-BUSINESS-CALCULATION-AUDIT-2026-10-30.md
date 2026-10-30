# KFE End-to-End Architecture, UI, Business Logic and Calculation Audit — 2026-10-30

**Classification:** SUPPORTING AUDIT / EVIDENCE — NOT A CANONICAL AUTHORITY  
**Repository:** `amtalwalkar-sudo/KFE-New`  
**Branch:** `fix/simple-four-event-gps-capture`  
**PR:** #412 (open; not merged)  
**Scope:** Five requested audit areas, from architecture foundation through presentation boundaries, business rules, calculations, and cross-layer verification.

The canonical authorities remain the files listed in `KFE-AUTHORITY-MAP.md`. This report records source findings and implementation corrections; it does not redefine business meaning or formulas.

## Executive result

The five audit passes have been performed against the PR branch and corrective changes have been pushed to PR #412. Several material contradictions were found and corrected. This is **not yet a release sign-off**: current-head CI must pass, rendered-browser calculation verification remains incomplete, and Android physical-device acceptance remains outstanding.

## 1. Architecture foundation and ownership

### Verified
- The authority hierarchy identifies one owner for business meaning, arithmetic, architecture, canonical data, operational lifecycle, UI/shell, and form/recovery responsibilities.
- The architecture contract defines the logical canonical model and the platform-specific persistence boundary: browser PWA IndexedDB and Android native SQLite are separate physical stores, converging on one logical business model.
- Domain modules are isolated from presentation, repositories, application, and infrastructure imports by the architecture contract.
- Canonical runtime code is guarded against imports from the legacy `src/services/` directory.
- The repository contains an executable architecture contract and a canonical contract runner. The current runner contains 134 maintained suites; Phase 0, Phase 1 and build/release-gated audits remain separate workflows, rather than being indiscriminately executed before their prerequisites.

### Corrections in this PR
- `spec/architecture/layers.json` previously allowed presentation to import domain and infrastructure directly, contradicting the human-readable architecture/UI contracts. The machine-readable rule now restricts presentation imports to application contracts and explicitly forbids presentation-to-infrastructure imports.
- `spec/calculations/index.json` referenced non-existent maintenance and currency implementation paths and pointed the loan calculation at the general performance engine. The targets now point to existing canonical files.
- The contract runner previously omitted ten existing contract suites. All discovered `*.contract.js` suites are now registered, and the runner fails if a new suite is left unregistered.

### Remaining proof
- Native SQLite and PWA IndexedDB remain separate physical stores by design; emulator and physical-device interruption/reopen acceptance is still required.
- Repository-level dependency contracts cannot prove runtime convergence on every Android lifecycle boundary.

## 2. UI/UX shell uncoupling

### Verified
- `KfeShell.vue` owns the primary PWA frame, header, content host, and Work / Timeline / Performance / Admin navigation.
- `AdminShell.vue` is a screen-local Admin heading/back affordance, not a second global navigation shell.
- Work, Timeline, Performance, and Admin views use application services for canonical commands and read models; presentation files do not own IndexedDB writes.
- The shell does not import business/domain calculations or persistence.

### Corrections in this PR
- `AdminView.vue` directly queried the shell's `.content-scroll-area` element. It now emits a shell viewport intent; the shell owns the scroll-container lookup and operation.
- GPS status, diagnostic, and backup UI components previously reached into native/platform providers directly. They now call application-facing services; native GPS and backup file plugins are isolated in infrastructure adapters. The obsolete five-second GPS status polling loop was removed; status refresh is event-driven (panel open, focus, visibility, or explicit action).
- Removed the unreachable legacy Finance Ledger panel from Admin; the approved Admin navigation remains Business Setup, Vehicle Records, Finance, and Settings.
- Admin presentation previously calculated source payment balances, compliance-validity revenue summaries, loan schedule status, and prepayment tenure/interest impact. These projections now use application read models or the canonical loan domain engine.
- `CalculationsView.vue` previously imported domain time utilities and repeated the fuel quantity formula. Reporting-period and fuel-quantity access now go through `CalculationsService`, which delegates to the domain formula.
- Admin's effective driver-target and maintenance-rate selection now goes through the Admin read-model service, which delegates to the same domain selectors used by the performance engine. This prevents inactive/expired records and differing tie-break rules from producing a different Admin answer.
- Admin's duplicate form-level business validation was removed where the authoritative Admin form service already validates the same fields.

### Remaining proof
- `WorkModuleView.vue` still owns transient form state, modal/selection state, and some workflow-specific UI transitions. Durable draft persistence and native event replay/acknowledgement are in application controllers, but the Work view is not yet fully thin.
- The source contracts do not replace rendered viewport, keyboard, Android Back, and screen-by-screen interaction testing on actual devices.

## 3. Business-rule ownership and consistency

### Verified
- `KFE_BUSINESS_RULES_REGISTER.md` is the sole business-rule authority.
- `docs/KFE-CALCULATION-SPECIFICATION.md` owns arithmetic mechanics, subordinate to business meaning.
- Shift lifecycle ownership is explicit: PWA starts/ends shifts; the native overlay handles ride actions only within an active shift.
- Compliance/renewal is date/validity-based. It is not a cumulative provision bucket.
- GPS capture is restricted to the four ride-event moments; locality enrichment is explicit user action, not an automatic background retry pathway.

### Material defect found and corrected
**BR-10A — signed provision balances:** the authoritative rule says EMI and Maintenance provision balances must not be clamped at zero and prohibits a separate additional-requirement ledger. The implementation and tests contradicted that rule:
- Maintenance provision was clamped to zero and overpayment was exposed as a separate excess-payment value.
- EMI provision was clamped to zero and advance payment was exposed as `paymentsAheadOfAccrual`.

The domain engines now preserve the signed balance (`accumulated provision - actual applied payment`). The parallel excess/ahead-of-accrual fields were removed, and the regression contracts now assert negative balances. Compliance remains excluded from cumulative provision buckets.

### Remaining proof
- The negative EMI and Maintenance balances must be checked in the current rendered Performance/Finance read models, not only in domain return values. The existing UI evidence does not yet prove that every required surface displays the signed balance.
- The Compliance screen's “revenue observed during validity” is a contextual display aggregate, not a canonical compliance provision or business rule. It is now an application read-model projection and uses IST calendar dates; it must not be interpreted as a compliance balance.

## 4. Calculation correctness and traceability

### Verified
- Canonical calculation authorities exist for movement, revenue, actual operating costs, fuel, maintenance provision, loan amortization, compliance renewal provision, break-even, driver targets, daily allocation, and financial facts.
- Monetary loan calculations use paise internally; loan interest uses actual calendar days / 365 and IST date semantics.
- Fuel cost/km is based on qualifying full-tank intervals; partial fills remain actual spending records but do not independently create a mileage interval.
- Reporting period boundaries are defined in IST.
- Independent-oracle, adversarial, finance, loan, and traceability contracts exist.

### Corrections in this PR
- Corrected the EMI and Maintenance provision balance formulas to follow BR-10A.
- Found two implementations of fuel quantity division in Work and Calculations. Work now delegates to the shared `calculateFuelQuantityKg` domain formula, so validation remains in Work while the arithmetic has one owner.
- Effective maintenance-rate selection is now one domain function shared by Performance and Admin; driver-target selection delegates to the canonical domain selector, including active/inactive and effective-until rules.
- Moved Admin's prepayment tenure reduction and remaining-interest projection into `loanEngine.js`; the view now renders the domain result.
- Moved Admin's schedule paid/due/overdue status projection out of the Vue component.
- Centralized fuel quantity derivation through `calculateFuelQuantityKg` via `CalculationsService`.
- Corrected stale machine-readable calculation implementation targets.
- Fixed stale Timeline references in the calculation evidence contracts and removed an obsolete test expectation that Timeline should expose ride KM. Timeline only displays recorded ride fields; ride distance is not recorded as a ride metric.

### Remaining proof
- The historical CI #2506/#2520 calculation evidence belongs to an older commit and is not current-head proof.
- The calculation matrix explicitly records rendered UI and persisted-input-to-rendered-output E2E as NOT PROVEN until current browser assertions are run.
- The new calculation matrix, calculation evidence, and Phase 5 traceability contracts are now included in the canonical runner; current CI must establish whether they pass together.

## 5. Cross-layer verification and release evidence

### Corrections in this PR
- The canonical runner now registers the maintained 134-suite set, including the new Admin read-model, monthly break-even, and event-bound lifecycle regressions. Stale/standalone phase audits are kept in their own workflows; an obsolete duplicate Phase 8 Android contract was removed rather than blindly added to the runner.
- Added focused Admin read-model tests for payment totals, malformed payment data, overpayment visibility, IST validity dates, EMI status, effective driver targets, and effective maintenance rates.
- Strengthened architecture and calculation-boundary contracts to detect presentation-to-domain/infrastructure dependencies, shell DOM coupling, and known financial formulas leaking into views.
- Registered the calculation matrix and five-year Phase 5 traceability suites after correcting their stale Timeline path assumptions.

### Required final evidence
1. Current PR head SHA and a fully green CI run, including all registered contracts, PWA build, Android build and emulator smoke gates.
2. Rendered browser assertions for seeded canonical inputs → domain/application calculation → displayed values, units, period and evidence state.
3. Android emulator evidence for native overlay and persistence/replay boundaries.
4. Physical-device acceptance for offline four-event GPS capture, permissions, screen-off/background behavior, restart/reopen recovery, and PWA shift start/end.

## Findings register

| ID | Area | Finding | Action / status |
|---|---|---|---|
| KFE-E2E-01 | Architecture | Machine-readable presentation dependency rules contradicted architecture/UI authorities | Corrected; CI pending |
| KFE-E2E-02 | Architecture | Calculation metadata referenced stale/non-existent implementation paths | Corrected; CI pending |
| KFE-E2E-03 | Test governance | Contract inventory mixed current suites with standalone/build-gated and stale historical contracts | Maintained 134-suite canonical runner; registered relevant new regressions, kept Phase 0/1/release workflows separate, and removed obsolete duplicate Phase 8 contract |
| KFE-E2E-04 | Shell | Admin view queried shell-owned scroll DOM | Replaced with shell viewport event |
| KFE-E2E-11 | Platform boundaries | GPS status, diagnostics and backup components directly accessed native/infrastructure providers; GPS status polled every 5 seconds | Application services and infrastructure adapters added; status polling removed |
| KFE-E2E-12 | Admin UI | Unreachable legacy Ledger screen remained in Admin source despite no approved Ledger navigation | Removed obsolete component and branch |
| KFE-E2E-13 | Calculations | Work and Calculations had separate fuel quantity division implementations | Both now use the single canonical `calculateFuelQuantityKg` formula |
| KFE-E2E-05 | UI/calculations | Admin and Calculations views contained domain-derived arithmetic/projections | Moved to application/domain owners; focused tests added |
| KFE-E2E-06 | Business rules | EMI and Maintenance provision buckets were zero-clamped contrary to BR-10A | Corrected to signed balances; side ledgers removed |
| KFE-E2E-07 | Calculation traceability | Calculation evidence contracts made unsupported Phase 1 UI claims and contained stale Timeline paths | Paths and UI-scope assertions corrected; rendered advanced UI remains NOT PROVEN |
| KFE-E2E-08 | Cross-layer UI | Current rendered UI and persisted E2E proof incomplete | Open — browser verification required |
| KFE-E2E-09 | Native runtime | Physical-device offline GPS and restart acceptance not available from repository CI | Open — device acceptance required |
| KFE-E2E-10 | UI uncoupling | Work view still owns some transient workflow state/transitions | Partially extracted; further separation remains open |

## Final status

**Audit coverage:** all five requested areas inspected and findings recorded.  
**Corrections:** material source, contract, metadata, and documentation corrections pushed to PR #412.  
**Verification:** pending current-head CI; no green status is claimed in this report.  
**Release sign-off:** NOT COMPLETE until current CI, rendered browser E2E, emulator, and required physical-device evidence are available.

No merge is authorized by this audit report.
