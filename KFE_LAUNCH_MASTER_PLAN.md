# KFE Current Release Plan

**Status:** CURRENT — applies to the simplified KFE product on PR #412.
**Product scope authority:** `KFE_BUSINESS_RULES_REGISTER.md`.
**Android acceptance details:** `KFE_ANDROID_RELEASE_GATE.md`.

This plan replaces the older numbered ERP phase sequence for current release work. Historical phase/freeze files remain evidence only and must not expand current scope.

## Current product boundary

1. PWA-owned shift start/end and shared Work workflow.
2. Native Android ride overlay for ride actions during an active shift.
3. Four offline-capable, event-time GPS snapshots.
4. Read-only Timeline with manual-only locality resolution.
5. Basic recorded-data Performance.
6. Basic Admin forms and saved data.
7. Essential local backup, Dropbox backup, restore and recovery safeguards.

No retired targets, provisions, forecasts, break-even, profitability, loan amortization, ride-distance, route-tracing, OCR/import, or separate notification product may be reintroduced without an explicit request.

## Release sequence

| Step | Gate | Exit condition |
|---|---|---|
| 1 | Scope and documentation | Product, business rules, data model, architecture and current acceptance docs agree |
| 2 | Source audit and cleanup | One active owner/path per responsibility; obsolete active code/docs removed or clearly historical |
| 3 | Automated verification | Latest commit passes contract, conformance, persistence/recovery, PWA build/runtime, UI isolation and Android exact-APK emulator gates |
| 4 | Physical Android acceptance | Exact APK passes the phone scenarios in `KFE_ANDROID_RELEASE_GATE.md` |
| 5 | Defect closure | Any device defect is fixed, regression-tested and all affected gates rerun |
| 6 | Merge decision | Latest head is green, device evidence is recorded, and user authorizes merge |

## Evidence rules

- CI and emulator evidence do not prove physical-device behavior.
- A new commit requires CI verification against that new head.
- A successful build is not a substitute for persisted-state and recovery assertions.
- Missing evidence is recorded as pending, never inferred as pass.
- Do not merge PR #412 without explicit user authorization.

## Historical material

Older phase numbers, frozen phase decisions, and historical CI/APK hashes describe earlier repository states. They are not current release instructions and cannot override this plan, the business-rule register, or the current Android acceptance gate.
