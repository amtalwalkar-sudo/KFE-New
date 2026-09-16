# KFE 2.0 Presentation Boundary

## Purpose

This document defines the KFE 2.0 presentation-layer boundary so active UI surfaces can be redesigned without changing ERP behavior.

## Current product areas

KFE currently has exactly three active product areas:

- **Work** — operational work, sessions, trips, ride capture and related real-world data collection/workflows.
- **Performance** — business position, operating interpretation and performance reporting.
- **Admin** — configuration and back-office management.

There is no Timeline product area in the current KFE scope.

## Frozen below Presentation

The following layers are not to be changed as part of presentation cleanup unless a real contract defect is demonstrated:

- Domain rules and state transitions
- Application services and orchestration
- Repository contracts and persistence
- IndexedDB/local database behavior
- Financial calculations and allocation rules
- Fuel, Expenses, Revenue, Loans, Maintenance, Compliance behavior
- Work lifecycle semantics, including Break handling
- Performance functionality
- Admin functionality

## Performance presentation contract

Performance is a consumer of authoritative calculations. The presentation layer must not reproduce or reinterpret business formulas.

```text
Canonical IndexedDB
      ↓
PerformanceRepository
      ↓
canonical snapshot
      ↓
normalization
      ↓
domain/application calculations
      ↓
authoritative metrics
      ↓
PerformanceView
```

The Performance UI may format and label values, but must not independently calculate:

- revenue, vehicle KM, business KM, dead KM, fuel, maintenance, financing, renewal or profit
- monthly break-even
- daily break-even
- monthly Driver Target obligation
- rolling balance
- remaining eligible days
- Driver Target
- pace variance
- target achievement using an incompatible period/unit

Monthly break-even is a monthly value. Driver Target and pace are daily-per-financial-day representations. A selected-period revenue value must not be divided by or compared directly with a one-day target unless an explicit same-unit conversion is performed by the application/domain layer.

Projection is not part of the Driver Target authority and is not displayed as target logic.

## Live calculation consumption

Performance metrics must remain synchronized with the canonical database:

```text
DB mutation
  ↓
canonical data-change notification
  ↓
Performance snapshot refresh
  ↓
computed metrics recompute
  ↓
UI update
```

The current implementation provides this invalidation path for canonical admin writes, shift/trip writes, fuel writes, and backup restore. Future mutation paths must use the same notification boundary rather than creating a Performance-specific data cache.

## Timezone

All KFE calendar classification and reporting boundaries use **IST (`Asia/Kolkata`)**. This includes day, week, month, financial-day, holiday, open-month, and closed-month boundaries. The device/browser timezone must not change KFE business-day classification.

## Presentation may change

- Vue component markup
- Layout and responsive structure
- CSS and visual design
- Navigation presentation
- Spacing, typography, cards, buttons, and information hierarchy
- Accessibility attributes and presentation-only selectors
- Presentation-specific state projection
- Browser/UI tests that assert obsolete DOM structure

## Clean Work presentation reset

Work remains an active KFE product area and its domain/application capability remains authoritative. The old Work presentation implementation is not to be resurrected or copied from historical code. If Work UI is rebuilt, it must be created from the current Work contracts and the Master Blueprint.

This is a presentation reset, not retirement of Work.

## Active Performance / Admin presentation

Performance and Admin remain active production presentation surfaces. Their calculations, data loading, actions, and application boundaries remain intact. Presentation cleanup may change only their layout, styling, responsiveness, and navigation presentation unless a real contract defect is demonstrated.

## Scope exclusion

KFE has no Timeline product area, screen, module, navigation entry, or presentation contract. Historical references to Timeline are source material only and must not be recreated as architecture or functionality.

## Test rule

A UI test must assert semantic behavior or the current presentation contract, not historical DOM structure. A failure caused only by a deleted legacy component, class, wrapper, or selector is a presentation-test mismatch and should be corrected in the test rather than restoring obsolete UI.

## Change rule

Before modifying a non-presentation file during UI cleanup, demonstrate that the failure is caused by an actual application/domain contract defect. Do not alter protected business logic merely to satisfy a legacy UI assertion.
