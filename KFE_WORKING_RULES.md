# KFE Working Rules

## Purpose

These rules govern development, audit, fixes, UX, native Android overlay work, data preservation, and release verification. The repository is the project source of truth.

## Product scope — mandatory

KFE contains only:
1. Ride and shift workflow.
2. Read-only Timeline.
3. Basic recorded-data Performance.
4. Basic Admin forms and saved data.
5. Capacitor + PWA, with native Android code responsible for Android-specific behavior including overlay and GPS capture.

Do not restore dormant or historical features because a test, document, component, or old module mentions them. No targets, break-even models, provisions, forecasts, profitability models, loan amortization, route/distance calculations, synthetic business data, or separate notification product. Any additional capability requires an explicit user request.

## Non-negotiable rules

1. Follow `KFE_LAUNCH_MASTER_PLAN.md` for sequence and gates, but do not use a historical phase note to expand current product scope.
2. Use the cycle: **Audit → Document → Fix → Re-audit**.
3. Do not implement unrelated redesign during an audit.
4. Keep one canonical business pathway per active workflow.
5. Preserve saved business records when removing code or UI. Feature cleanup must not silently reset or migrate records destructively.
6. Keep PWA UI, application workflows, domain rules, repositories, and native Android adapters uncoupled.
7. Shift start/end and driver setup remain PWA-owned. Native overlay handles ride actions only during an active shift.
8. GPS snapshots are one-shot and offline-capable at going to pickup, cancellation, trip start, and trip end. No continuous tracking, route tracing, distance calculation, automatic locality retry, or background connectivity polling.
9. Do not claim a fix, audit, device verification, APK, or green CI unless the corresponding evidence exists.
10. PR #412 remains open and unmerged unless explicitly instructed otherwise.

## Single source of truth

**KFE_BUSINESS_RULES_REGISTER.md is the sole authoritative source for KFE business meaning and business-rule definitions.**

- `KFE-AUTHORITY-MAP.md` is the governance index.
- `docs/KFE-ARCHITECTURE-CONTRACT.md` owns architecture and layer boundaries.
- `docs/KFE-CANONICAL-DATA-CONTRACT.md` owns stored facts, relationships, and data preservation.
- `docs/KFE-CALCULATION-SPECIFICATION.md` owns only the basic Performance calculations.
- `KFE_LAUNCH_MASTER_PLAN.md` owns phase sequence and gates; `KFE_LAUNCH_STATUS.md` records current state.
- Supporting documents, tests, UI, and native adapters may implement or verify these authorities but must not create competing rules.

## Canonical implementation paths

| Capability | Canonical path |
|---|---|
| Ride/shift workflow | `src/domain/work/tripLifecycle.js` → `src/application/work/workService.js` → `src/repositories/shiftTripRepository.js` |
| Fuel records | `src/domain/work/fuel.js` → `src/application/work/fuel.js` → `src/repositories/fuelRepository.js` |
| GPS event snapshots | `src/application/location/eventLocationService.js` and native Capacitor GPS plugin; event snapshots persist separately from ride facts |
| Timeline | `src/application/timeline/activityTimelineReadService.js`; locality lookup is user-initiated only |
| Basic Performance | `src/application/performance/phaseOnePerformanceService.js` using `src/repositories/performanceRepository.js` |
| Admin forms/data | `src/application/admin/adminService.js` → `src/repositories/adminRepository.js` |
| Android overlay | `src/infrastructure/android/androidOverlayLifecycle.js` → `src/infrastructure/android/kfeOverlay.js` → native `KfeOverlayService` |

## Audit discipline

- Discover current callers and tests before deleting a module.
- Remove obsolete UI, wiring, implementation, tests, and documentation as one coherent change.
- Keep tests for in-scope workflows and data preservation; remove tests that require retired features.
- After changes, run the canonical contract suite, PWA build, Android release gate, and relevant governance gates.
- If CI fails, fix the failure rather than treating earlier passing checks as proof.

## Evidence standard

A result is not verified merely because source code appears correct, a contract test passes, CI is green, or an APK artifact exists. If a gate requires runtime/device evidence, that evidence must actually exist.

