# KFE Work Cockpit Baseline

**Scope:** Work is the operational surface for the current ride and shift workflow. It is not a financial-planning screen.

## Responsibilities

- PWA owns shift start/end, driver setup, and shared Work presentation.
- PWA and native Android overlay use the same canonical ride lifecycle.
- Native overlay actions are available only during an active shift.
- Ride actions must be idempotent and preserve the same canonical Trip identity through start, completion, fare entry, and cancellation.
- Save source facts through the application/repository boundary; views must not write directly to storage.

## Visible operational state

- Current shift state and current ride action.
- Fare-entry recovery for a completed ride that still needs fare details.
- Recorded ride count and the canonical recorded shift revenue when useful to the active workflow.
- No driver targets, break-even, profit/provision balances, route distance, dead-kilometre estimates, or forecast metrics.

## GPS

- Capture one-shot snapshots at going to pickup, cancellation, trip start, and trip end.
- Capture must work offline and must not delay the ride action.
- No continuous tracking, route tracing, distance calculation, or background location retry.
- Keep provider capture time separate from the ride event timestamp.

## Architecture

The presentation boundary is governed by `docs/UI-UX-SHELL-CONTRACT.md`; this baseline defines only the Work-specific operational presentation.

- Work view → application-backed Work store/controllers → canonical repositories/native bridge.
- Shift start/end remain PWA-owned.
- Native Android code owns Android-specific overlay and GPS behavior.
- Keep one canonical pathway for each action and preserve existing saved records.
