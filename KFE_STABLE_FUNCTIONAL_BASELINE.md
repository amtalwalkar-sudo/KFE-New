# KFE Stable Functional Baseline

**Purpose:** The top-level stable starting point for current product work. The business-rule register and architecture contract remain the detailed authorities.

## Current product boundary

KFE consists only of these capabilities:

1. **Ride workflow** — shift start/end in the PWA; ride actions through the PWA and native Android overlay.
2. **Timeline** — read-only view of saved rides and fuel records.
3. **Basic Performance** — recorded revenue, completed ride count, cancellation fees, fuel spending, fuel cost/km from consecutive valid full-tank readings, and income after fuel.
4. **Basic Admin** — forms and saved source records for business setup, vehicle, driver, compliance, maintenance, loan details, settings, backup, and recovery.
5. **Capacitor + PWA** — the PWA owns shared UI and workflow; native Capacitor code owns Android-specific behavior, including the overlay and native GPS capture.

## Ride and GPS invariants

- Shift start/end remain PWA-owned.
- The native overlay performs ride actions only while a shift is active.
- Capture one-shot GPS snapshots at going to pickup, trip cancellation, trip start, and trip end.
- GPS capture must work offline. No continuous location tracking, route tracing, or distance calculation.
- Preserve `capturedAt` separately from the ride event timestamp `eventAt`.
- GPS capture must not block a ride action or invent a location.
- Locality lookup is user-initiated only through Timeline pull-to-refresh while online. No automatic retries, polling, background connectivity checks, or queued resolution jobs.
- Timeline never mutates business facts. Unreliable or unresolved locality is shown as `Location unavailable`.

## Data and reporting invariants

- Saved records remain authoritative. Views do not write business data or create parallel persistence paths.
- Preserve existing records during UI and code cleanup. Removing a retired feature must not delete its stored data.
- Recorded revenue comes from eligible completed-ride fares plus recorded cancellation fees. Cancellation remains distinct from a completed ride.
- Fuel spending includes recorded partial refills. Partial refills do not create a mileage interval.
- Income after fuel is recorded revenue minus recorded fuel spending.
- No forecasts, targets, break-even, provisions, loan amortization, profitability projections, or other derived financial models are part of the current product.

## Change discipline

- Keep UI shell, application workflows, domain rules, and repositories uncoupled.
- Keep one canonical pathway for each active workflow; remove unused duplicate pathways and obsolete UI wiring.
- Do not add new features because a historical document, test, or dormant module mentions them.
- A new capability requires an explicit user request before implementation.
- Do not merge PR #412 unless explicitly asked.

## Authorities

- Product/business scope: `KFE_BUSINESS_RULES_REGISTER.md`.
- Architecture and ownership boundaries: `docs/KFE-ARCHITECTURE-CONTRACT.md`.
- Canonical stored facts and preservation rules: `docs/KFE-CANONICAL-DATA-CONTRACT.md`.
- Basic Performance calculations only: `docs/KFE-CALCULATION-SPECIFICATION.md`.
- Current authority index: `KFE-AUTHORITY-MAP.md`.
