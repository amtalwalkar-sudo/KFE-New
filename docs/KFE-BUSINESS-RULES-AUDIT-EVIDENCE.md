# KFE Business Rules Audit Evidence

**Status:** EVIDENCE / AUDIT — not a competing business-rule authority.

## Scope verified

This evidence file records the current scope boundary. The sole authority for business meaning is `KFE_BUSINESS_RULES_REGISTER.md`.

- Ride and shift workflow.
- Read-only Timeline.
- Basic recorded-data Performance.
- Basic Admin forms and saved records.
- Capacitor + PWA, with Android-specific behavior owned by native code.

## Current invariants

- Shift start/end and driver setup remain PWA-owned.
- Native overlay performs ride actions only during an active shift.
- One-shot offline GPS snapshots are captured at going to pickup, cancellation, trip start, and trip end.
- Timeline locality resolution is manual-only via pull-to-refresh while online; no automatic retry, polling, or background connectivity checks.
- Timeline is read-only and shows `Location unavailable` when locality is not reliable.
- Basic Performance uses saved revenue and fuel records only. Fuel cost/km uses consecutive valid full-tank odometer readings; income after fuel is recorded revenue minus recorded fuel spending.
- Existing business records must be preserved when retiring obsolete UI, calculations, code, or tests.

## Out-of-scope dispositions

Historical targets, break-even, provisions, forecasts, profitability models, loan amortization, route/distance calculations, synthetic business data, and separate notification features are not current requirements. Their historical presence does not authorize restoring their UI or implementation.

## Verification discipline

Source review and contract tests are evidence, not proof of physical-device behavior. Report CI, APK generation, and device verification separately and only when each has actually completed.
