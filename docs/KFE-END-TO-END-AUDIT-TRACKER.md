# KFE End-to-End State, Revenue, GPS and UI Isolation Audit Tracker

Status: **IN PROGRESS — no release/merge approval implied**

Working branch: `audit/trip-derived-revenue-contract`

## Decisions frozen for this audit

1. `Shift.revenue` is the persisted projection of non-deleted eligible completed-trip fares plus non-deleted cancellation fees.
2. Missing/skipped completed-trip fare contributes ₹0. Blank/not-applicable cancellation fee is stored as numeric ₹0.
3. A cancellation fee contributes once only for a non-deleted `CANCELLED` trip; it is not a completed-trip fare.
4. Shift-end must not accept a competing manually entered revenue total.
5. PWA, Android overlay, persistence/recovery and reporting must agree on the same revenue projection.
6. UI/UX must be independently changeable: a local change to one component/form/button/layout must not silently move, restyle or change behavior of unrelated presentation components, and presentation changes must not alter calculations, storage contracts or business transitions.
7. Preserve one canonical business-state/command contract across the PWA and native overlay. PWA owns shift start/end; overlay may operate trip/fare/cancellation while the PWA is closed, but may not start/end shifts.

## Workstream status

| ID | Area | Status | Evidence / next action |
|---|---|---|---|
| A | Canonical state ownership and PWA/overlay synchronization | Audit in progress | Trace command → validation → durable write → acknowledgement → projection/replay on both surfaces. Explicitly test stale snapshot, simultaneous command, retry, lost acknowledgement and process death. |
| B | Fare, cancellation and revenue | Targeted changes in progress; not yet CI-validated | Canonical rule and supporting docs updated; JS projection and native projection aligned for deleted trips and explicit blank cancellation fees; tests added/updated. Validate full storage/recovery/reports path and all legacy migration cases. |
| C | GPS, Valhalla, distance categories and personal-km baseline | Not yet audited end-to-end | Trace GPS sample provenance, map-match/offline region coverage, online fallback, dead/business classification, shift-start personal gap, and honest handling of missing samples. |
| D | Timers, background, screen-off, process death and reboot | Not yet audited end-to-end | Verify durable state timestamps, state-specific elapsed time, foreground-service constraints, boot recovery and explicit GPS-gap markers without invented distance. |
| E | Android/Capacitor vs PWA responsibilities | Not yet fully audited | Identify duplicate business transitions/calculations and competing persistence paths; prove overlay works with PWA closed and reconciles on reopen. |
| F | UI/UX shell and component isolation | Baseline inventory documented; impact tool extended; refactor not started | See docs/KFE-UI-UX-COMPONENT-ISOLATION-AUDIT.md. The impact tool now reports Vue template hooks shared with other components/global style sources; this is a static warning, not visual proof. Next: establish visual/interaction baselines, extract view-model responsibilities, then migrate one form styling at a time. |
| G | Business-rule traceability and test coverage | In progress | Core revenue authority docs updated; remove stale authority wording; verify each rule against a source file, consumer surfaces, persistence behavior and executable regression test. |
| H | CI and emulator validation | Not started for this branch | Run only after static review and focused contracts are coherent. Do not merge until critical CI and Android gates pass. |

## Evidence-backed findings so far

### Confirmed defects corrected on the audit branch

- Native revenue aggregation treated a JSON `deletedAt: null` value as a non-empty string, potentially excluding a live trip from the projection. The check now excludes only a genuinely non-null deletion timestamp or an explicit deleted flag.
- A cancellation record with an explicitly present but null cancellation-fee field could fall back to the generic `revenue` field. The JS and native projections now distinguish an absent legacy field from an explicit blank/null fee; explicit blank/null contributes ₹0.
- Native revenue aggregation previously accepted only JSON numeric objects while the PWA also normalized numeric strings. Native projection now uses numeric parsing for legacy/imported values, matching the JS rule.
- Active-shift target progress used nullish fallback for cancellation fees, so an explicit null fee could fall back to generic trip revenue. It now distinguishes an absent legacy fee field from an explicit blank/null fee.
- Reconciliation previously returned `UNAVAILABLE` solely because a completed trip fare was missing, despite the frozen rule that missing fare contributes ₹0. It now compares the projection using zero contribution and exposes `unpricedTrips` as quality information.
- `WorkModuleView.vue` directly wrote canonical native records after `WorkService` had already mirrored trip and Shift records, creating a second storage path. The view now passes the durable operation identity to the application/store path; direct canonical writes were removed from the presentation layer.
- PWA cancellation submission now normalizes a blank fee to numeric zero before sending it to the store.
- Revenue documentation previously described shift-end revenue as the authority. Core data, calculation, lifecycle, business-rule, form-save-path and conformance documents now describe the trip-derived Shift projection. The authority identifier was updated to `TRIP_DERIVED_SHIFT_REVENUE`.

### Confirmed architectural/test gaps to investigate

- The PWA JavaScript projection and native Java projection are separate implementations. Source-level parity assertions are not a substitute for running the same adversarial fixture set against both implementations and comparing persisted outputs.
- `WorkModuleView.vue` combines screen composition, transient form state, action handlers, native event integration and read-model use. The shell boundary is documented, but this view is still a large change-impact surface.
- `KfeOverlayService.java` owns several overlay workflows and a native revenue projection; inspect and isolate responsibilities without changing its visual/gesture behavior unintentionally.
- The presentation impact tool follows local imports and reports some unscoped CSS selector overlap, but it does not establish component-by-component layout invariance for form fields, buttons, spacing, ordering, focus and keyboard placement.
- Historical shifts whose old manually entered revenue cannot be reconstructed from trip details are flagged through `legacyRevenueSnapshot` and `REVIEW_REQUIRED`. Audit the upgrade/review UX and verify historical reports do not silently treat those values as reconstructed revenue.

## Required acceptance gates

- **State integrity:** every accepted action has a durable operation identity, canonical revision/state, idempotent replay and a visible failure/recovery result. No duplicate or lost transition across PWA/overlay.
- **Revenue:** completed fares + cancellation fees equal the persisted Shift projection; blank/skipped/deleted/active records contribute zero; a ₹250 fare + ₹25 cancellation fee produces ₹275; retries/replays/corrections do not double-count.
- **Distance:** GPS/Valhalla results preserve provenance and accuracy; downloaded coverage works offline; online fallback is used outside offline coverage; gaps are flagged rather than interpolated into fabricated distance; personal/dead/business KM follow the documented state rules.
- **Lifecycle:** background, screen-off, process death and reboot restore the last durable state; recording resumes only when OS permissions/lifecycle rules allow; elapsed gap is explicit and does not invent GPS samples.
- **Layer separation:** UI components emit semantic intents; domain calculations are presentation-independent; repositories own durable writes; PWA/native adapters implement the same contract; shell/layout changes cannot mutate business state.
- **UI isolation:** each form, button group, metric, overlay region and navigation surface has a stable identity and explicit local styling/layout ownership. A scoped change produces a reviewed impact report; unrelated component snapshots/geometry and interaction contracts remain unchanged.
- **Validation:** focused contracts pass first; then the full CI/build/Android release gates pass on the exact candidate commit; emulator tests cover recovery/failure paths; physical-device acceptance remains separate.

## Execution log

- 2026-10-19: Began branch `audit/trip-derived-revenue-contract`.
- 2026-10-19: Recorded trip-derived revenue as the financial authority and updated core docs.
- 2026-10-19: Added regression coverage for ₹250 + ₹25, blank/skipped fees and deleted records; corrected native deleted-record and explicit-null cancellation handling.
- 2026-10-19: Updated the calculation authority label and conformance assertions to avoid implying shift-end manual revenue entry.
- 2026-10-19: Removed direct native canonical writes from WorkModuleView; durable operation identity now travels through the Work store/application boundary.
- 2026-10-19: Corrected native numeric amount normalization and active-shift cancellation-fee handling; missing fare detail now contributes zero in reconciliation.
- 2026-10-19: Full test suite and CI remain pending; no merge decision has been made.
- 2026-10-19: Full tests/CI have **not** yet run. Local clone was unavailable in this environment; run repository CI after static review is complete.
