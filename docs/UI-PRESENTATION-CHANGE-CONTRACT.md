# UI Presentation Change Contract

**Status:** Project-level engineering rule  
**Scope:** KFE PWA Workflow, native Android overlay presentation, and read-only Timeline  
**Purpose:** Allow future UI redesigns without regressing operational behaviour, financial rules, offline persistence, or data integrity.

## Core rule

Treat a visual redesign as a presentation-layer change by default. Do not change business rules, application workflows, record identity, persistence semantics, or data ownership merely to achieve a different appearance.

The existing working Workflow and Timeline are protected behaviour. A redesign must preserve them unless a separate, explicit product decision authorizes a behaviour change.

## Layer boundaries

1. **Presentation layer** owns layout, typography, colours, spacing, responsive behaviour, visual components, animations, and presentation-only navigation.
2. **Application layer** coordinates user intentions, use cases, validation, and calls to domain/persistence interfaces.
3. **Domain layer** owns business rules and calculations, including trip/shift state rules, fare/revenue semantics, fuel metrics, and period calculations.
4. **Persistence/canonical boundary** owns durable records, record identity, consistency, recovery, and offline read/write behaviour.

Views should render application/domain results and submit user intentions through established application interfaces. Do not duplicate domain calculations or write directly to storage from presentation components.

These boundaries must be verified against the actual code before a redesign; do not assume existing files are already perfectly isolated.

## Workflow invariants

A Workflow presentation change must preserve:

- The PWA's ownership of shift start and shift end.
- The native Android overlay's role as a trip-workflow interface during an active shift; do not add native shift-end behaviour as part of a redesign.
- Existing trip-state transitions, fare entry and validation, cancellation behaviour, and revenue semantics.
- Canonical record identity, durable-save acknowledgement, retry/idempotency, stale-write protection, and recovery behaviour.
- Offline operation and the established PWA/native shared-data contract.
- Existing form recovery and pending-fare behaviour where applicable.

Moving, restyling, renaming, or replacing a button must not silently change what operation it performs or when it commits.

## Timeline invariants

Timeline is a **read-only report**, not a separate business system.

- It reads existing canonical/persisted operational and fuel records through the appropriate services.
- It must not create, update, delete, or repair operational records as a side effect of viewing, filtering, sorting, or rendering.
- Keep business calculations in the domain/application reporting layer, not in UI components.
- The selected period filter remains shared by Rides and Fuel; Today remains the default unless separately approved.
- Preserve established period boundaries, cancellation semantics, missing/pending-fare handling, and fuel accounting rules.
- Display area/locality labels rather than full street addresses. Do not add background GPS or reverse-geocoding as a visual redesign side effect.
- Do not invent missing values or display pending/missing fare as a genuine zero.
- Keep the existing distinction between fuel spending and valid mileage/cost-per-kilometre evidence.

A new card, chart, summary, or filter must use the existing report model or require a separately reviewed data-contract change.

## Safe redesign scope

Normally safe after checking dependencies:

- Colours, typography, spacing, icons, shapes, card/list/table layouts.
- Responsive arrangement and visual hierarchy.
- Presentation-only components and loading/empty/error states.
- Reordering information without changing the underlying workflow or calculation.
- Accessibility and touch-target improvements.

Not presentation-only; requires explicit design review and targeted tests:

- Changing action sequencing, validation, or save timing.
- Changing domain calculations, period semantics, record schemas, identifiers, or storage.
- Moving business logic into a view or introducing a second source of truth.
- Changing PWA/overlay responsibilities or the canonical persistence boundary.
- Adding GPS collection, reverse-geocoding, network dependence, or a new fuel persistence path.
- Making Timeline actions mutate operational data.

## Required workflow for a UI redesign

1. **Audit first:** identify the relevant views/components, their imports, event handlers, application services, domain functions, persistence access, and existing tests. Record any coupling that makes a proposed change unsafe.
2. **Define scope:** state which presentation files may change and which behaviour/data contracts are explicitly out of scope.
3. **Reuse stable contracts:** use existing application services and read models. Do not bypass canonical writes or create a parallel data store.
4. **Implement narrowly:** separate visual changes from any necessary behaviour change; avoid bundling unrelated refactors.
5. **Test behaviour independently of appearance:** run targeted contract/regression tests for workflow transitions, persistence/recovery, read-only Timeline, calculations, period filters, and PWA/native integration as relevant.
6. **Run repository gates:** run the applicable full test suite, production build, Android compile/instrumentation, and CI gates. Fix failures rather than weakening tests or updating assertions to merely match the new UI.
7. **Review the diff:** verify that storage, domain rules, and unrelated operational screens were not changed unintentionally.
8. **Verify on device:** after merge, confirm the redesigned screen and core Workflow/Timeline behaviour on the physical Android device. State exactly what was and was not verified.
9. **Merge only when ready:** do not merge with unexplained failures or an unverified regression in a protected workflow.

## Regression acceptance checklist

- [ ] Workflow starts/ends shifts through the correct interface.
- [ ] Overlay trip stages, completion, fare entry, and cancellation still behave correctly.
- [ ] A successful save is shown only after the established durable-commit confirmation.
- [ ] Retry/recovery does not create duplicate shifts or trips or attach a fare to the wrong trip.
- [ ] Reload/reopen retains the expected records and the PWA/native views agree under the established contract.
- [ ] Timeline is read-only and does not mutate operational or fuel records.
- [ ] Timeline period selection affects Rides and Fuel together and preserves correct period boundaries.
- [ ] Fare, cancellation, and fuel summaries retain domain-defined semantics, including missing/pending data.
- [ ] Locality privacy is preserved.
- [ ] Relevant tests, build, Android checks, and CI pass.
- [ ] Physical-device verification is recorded separately from automated checks.

## Change-control rule

If a proposed UI change appears to require a business-rule or persistence change, stop and describe that dependency first. Get explicit approval for the behaviour change, document it separately, and add its own tests. Do not smuggle it into a visual redesign.

**Success criterion:** the UI may look substantially different while the same established business operations, records, calculations, offline behaviour, and recovery guarantees continue to work.


## Performance dashboard: metric and presentation contract

The Performance menu must be designed as an extensible, read-only reporting surface. Once a metric's business meaning and calculation are finalized, its calculation contract must remain independent of how the metric is presented.

### Required separation

Keep these responsibilities separate:

1. **Data and calculation layer:** obtains canonical records through the established application/reporting services and calculates values using explicit business rules and reporting-period boundaries.
2. **Metric contract/definition layer:** gives each metric a stable identifier and defines its meaning, value, unit, formatter, availability/missing-data semantics, explanatory text, and other presentation-neutral metadata as appropriate.
3. **Presentation layer:** decides how metrics appear, including cards, charts, tables, grouping, ordering, emphasis, labels used for display, colours, typography, spacing, and responsive layout.

The exact module boundaries must follow the repository's actual architecture and be introduced incrementally. Do not create a registry or abstraction merely for its own sake; it must reduce coupling and have tests.

### Presentation changes must not change metric meaning

- A presentation-only redesign may change a metric's card into a chart, change its size or style, move it between sections, reorder it, or replace the dashboard layout.
- Such changes must not change the metric's formula, source records, authoritative service, reporting period, currency/unit, inclusion rules, or missing-data meaning.
- Presentation components must not independently calculate financial or operational metrics, query persistence directly, or create a competing source of truth.
- The Performance view must continue to use the established application/reporting service and its existing period-selection and data-change wiring unless a separately reviewed contract change is approved.
- The dashboard remains read-only. Viewing, filtering, sorting, or rendering must not mutate canonical operational records.

### Adding or finalizing a metric

Before a new metric is considered finalized:

1. Define its business meaning and formula, including the records and statuses included or excluded.
2. Define period attribution and boundary behaviour, units, rounding, and how unavailable, missing, pending, or invalid source data is represented.
3. Implement the calculation in the appropriate domain/application reporting layer, not in the view.
4. Add targeted tests for the formula, boundary cases, missing data, and relevant operational states.
5. Expose the result through a stable metric contract that presentation components can consume without knowing how the value was calculated.
6. Add the metric to the chosen section/layout independently of its calculation.
7. Verify that existing metrics and their results remain unchanged.

A new metric may require new source data or business logic. That is a calculation/data-contract change, not a presentation-only change; review and test it separately before displaying it.

### Presentation redesign acceptance criteria

- Existing metric IDs and meanings remain stable unless an explicitly reviewed metric-contract change is approved.
- Replacing or rearranging presentation components does not change calculated values for the same input snapshot and reporting period.
- Metric calculations can be tested without mounting UI components.
- Presentation components can be tested with supplied metric results without accessing canonical storage.
- Missing or unavailable values are not silently converted to zero, estimates, or fabricated values.
- The selected reporting period is applied consistently by the established reporting service; UI components must not invent their own period logic.
- The existing loading, error, subscription/data-refresh, and stale-response protections remain intact.
- Automated regression tests demonstrate that presentation-only changes preserve metric outputs and existing Performance wiring.
- Relevant production build and CI gates pass. Physical-device verification is recorded separately and must not be claimed unless actually performed.

**Performance success criterion:** after a metric is finalized, its presentation can be redesigned independently; adding a metric does not require redesigning the whole page; and neither operation silently changes financial meaning, reporting semantics, canonical persistence, or existing operational behaviour.
