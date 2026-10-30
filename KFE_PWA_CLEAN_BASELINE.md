# KFE PWA Clean Baseline

**Current product boundary:** Work / rides workflow, read-only Timeline, basic Performance, essential Admin forms and saved data, and the Capacitor-native Android overlay.

## Architecture

- The PWA owns shared UI and shift start/end.
- Capacitor/native Android owns Android-specific behavior, including overlay and native GPS capture.
- Work and overlay actions converge on the same canonical ride lifecycle.
- Domain rules and persistence belong behind application/repository boundaries; views remain presentation-focused.
- Saved records are authoritative. Timeline and Performance are read-only.

## Active product

- Work: shift start/end, pickup, trip start/end, cancellation, fare entry, and fuel recording.
- Timeline: saved rides/fuel and event GPS snapshots; area-name lookup is manual pull-to-refresh only.
- Performance: recorded revenue, completed rides, cancellation fees, fuel spending, fuel cost/km from valid consecutive full-tank readings, and income after fuel.
- Admin: Business Setup, Vehicle, Driver, Compliance, Maintenance, Loan details, and data backup/recovery settings.
- Android overlay: ride actions only during an active shift; no continuous tracking.

## Guardrails

- Dark theme only.
- No screenshot/OCR ride import, route tracing, ride-distance calculations, target/forecast/break-even/provision models, loan amortization, or unrelated financial features.
- Preserve saved business records and backup/recovery data while retiring unused code.
- Keep one canonical implementation path for each active workflow.
