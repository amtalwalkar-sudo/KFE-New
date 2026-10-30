# KFE Business Rules Register

**Status:** Authoritative scope and business-fact contract.

This register intentionally defines only the current KFE product scope. Historical calculation specifications are not active product requirements.

## 1. Product boundary

KFE consists only of:
1. Ride workflow, including shift-owned start/end and ride actions.
2. Read-only Timeline.
3. Basic Performance based on recorded fares and fuel records.
4. Basic Admin forms and saved business data.
5. Capacitor + PWA, with Android-specific capabilities owned by native Capacitor plugins.

Do not add forecasting, targets, break-even models, provisions, profitability models, amortization calculations, or unrelated financial calculations without a new explicit user request.

## 2. Ownership and architecture

- The PWA owns the shared UI and shift start/end workflow.
- Capacitor/native Android owns Android-specific behavior, including the native overlay and native GPS capture.
- The native overlay handles ride actions only while a shift is active.
- Domain/business rules and persistence must not be duplicated in presentation components.
- Admin forms save authoritative facts. Read-only screens consume saved facts and must not mutate them.
- Preserve existing user records when simplifying code. Code cleanup must not silently reset or migrate business data destructively.

## 3. Ride workflow

- Keep one canonical ride lifecycle across the PWA and native overlay.
- Ride actions must not create duplicate trips or duplicate business outcomes when retried.
- Shift start and shift end remain PWA-owned.
- The native overlay can perform ride actions only within an active shift.
- A cancellation remains a cancellation and must not be represented as a completed ride.
- Fare and cancellation fee remain distinct recorded facts. Recorded shift revenue includes eligible completed-trip fares and recorded cancellation fees; a missing cancellation fee contributes zero.

## 4. GPS event snapshots

Capture a one-shot GPS snapshot for these four ride events:
- Going to pickup (PICKUP_START).
- Ride cancellation (TRIP_CANCELLED).
- Trip start (TRIP_START).
- Trip end (TRIP_END).

Rules:
- GPS capture must work offline and must not require continuous tracking.
- Preserve provider capture timestamp (capturedAt) separately from ride event timestamp (eventAt); do not change established ride timestamp behavior.
- Missing permissions or an unavailable fix must not block the ride action or fabricate coordinates.
- Persist event snapshots independently from ride business facts.
- Timeline is read-only and must not mutate ride records.
- Locality resolution is manual-only, triggered by a user pull-to-refresh while online. No automatic retries, polling, background connectivity checks, or queued locality-resolution jobs.
- Show a reliable resolved locality only. Otherwise show Location unavailable; never infer a locality from stale or unreliable data and never display raw coordinates as a locality.
- A cancellation snapshot is not a drop-off location.

## 5. Timeline

- Timeline displays saved rides and fuel records for the selected period.
- Cancelled rides remain visible and are clearly labelled as cancelled.
- Do not calculate ride-distance metrics because ride distance is not an authoritative recorded input.
- Show pickup/drop locality only when reliably resolved; otherwise show Location unavailable.
- Fuel spending includes recorded partial refills. Fuel cost per kilometre is calculated only from consecutive valid full-tank odometer readings. Partial refills do not create a mileage interval.
- Timeline must not invent or backfill business facts.

## 6. Basic Performance

Use only existing recorded data. The current supported summary is:
- Recorded revenue from completed ride fares and cancellation fees.
- Completed ride count.
- Recorded fuel spending.
- Fuel cost per kilometre from valid consecutive full-tank readings.
- Income after fuel = recorded revenue − recorded fuel spending.

No forecast, target, break-even, provision, loan-amortization, projected-maintenance, or other derived financial model belongs in the current Performance screen.

## 7. Admin and persistence

- Admin is limited to basic forms, saved records, and the existing essential settings/recovery safeguards.
- Forms must remain usable on mobile and save through the canonical application/repository path.
- Preserve saved business data when removing obsolete features or UI.
- Do not add calculations or workflows merely because old code, tests, or documents mention them.
- Any destructive data reset must remain an explicit user action and retain the existing recovery safeguards.

## 8. Future changes

This scope is the default boundary for future work. A new capability requires an explicit user request before implementation. Old documentation, unused code, tests, and registry entries do not independently authorize bringing an out-of-scope feature back.
