# KFE Universal Form Standard

**Scope:** Shared interaction and persistence rules for the active Work and Admin forms only.

## Ownership

- Views and form components own presentation and local input state only.
- Application services validate and coordinate commands.
- Repositories own canonical persistence, mutation records, and audit history.
- Do not write canonical business records directly from a Vue component.
- Use the shared form system where it reduces duplication; do not create parallel form/save paths.

## Field and layout rules

- Every input has a visible label and a clear required/optional state.
- Validation errors identify the field and explain the correction in plain language.
- Use suitable numeric, date, telephone, and multiline controls; preserve valid zero values.
- Mobile forms must fit the viewport, respect safe areas and the keyboard, and keep Save/Cancel actions separate and reachable.
- Controls need accessible names, visible focus, and keyboard navigation.

## Save and recovery rules

- Prevent duplicate in-flight submissions.
- Validate before persistence and await the canonical repository result.
- Clear a draft only after a confirmed successful save or explicit confirmed discard.
- On save failure, keep the form and draft intact and show a useful error.
- Draft identity must be scoped to the form, workflow step, and relevant parent record.
- When editing an existing record, preserve saved fields that the current form does not display; removing a field from UI must not silently erase stored data.
- Keep deletion soft and auditable where the canonical repository supports it.

## Current Admin forms

Business Setup, Vehicle, Driver, Compliance, Maintenance, and Loan details use the shared Admin form/save boundary. These forms capture source facts; they do not launch financial planning or calculation workflows.

## Out of scope

No separate Calculations screen, target/provision inputs, payment allocation/prepayment forms, loan schedules, forecasts, or derived financial dashboards.

## Verification

Contract tests cover validation, persistence boundaries, draft recovery, and responsive structure. CI status, generated APK status, and physical-device verification must be reported separately.
