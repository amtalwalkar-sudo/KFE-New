# KFE PWA Form Save Path Matrix

**Status:** Current scope only. This replaces the historical matrix that described retired calculations and forms.

## Active surfaces

- `/` — Work / rides workflow.
- `/timeline` — read-only rides and fuel history; locality lookup is user-triggered by pull-to-refresh only.
- `/performance` — basic read-only recorded-data summary.
- `/admin` — essential forms and saved source records.

## Admin forms

| Form | Canonical store | Save path |
|---|---|---|
| Business Setup | `settings` | `AdminSourceForm` → `AdminView` → `AdminService` validation → `AdminRepository` |
| Vehicle | `vehicles` | Same shared form path; vehicle identity and lifecycle facts |
| Driver | `drivers` | Same shared form path; identity and vehicle assignment |
| Compliance | `compliance_records` | Same shared form path; validity dates and recorded cost |
| Maintenance | `maintenance_records` | Same shared form path; actual maintenance facts and cost |
| Loan | `loans` | Same shared form path; saved loan source details only |

Every successful save writes through the canonical repository and mutation/audit boundary. A form draft clears only after a confirmed save or explicit confirmed discard. Editing a record must preserve existing legacy fields that the current form does not display.

## Work and GPS

- PWA owns shift start/end and shared workflow presentation.
- PWA and native overlay route ride actions through the same canonical lifecycle and preserve one Trip identity.
- Native overlay handles ride actions only while a shift is active.
- Capture one-shot GPS snapshots for going to pickup, cancellation, trip start, and trip end. Keep provider `capturedAt` separate from event `eventAt`.
- GPS capture is offline-capable and does not start continuous tracking or route-distance calculations.
- Timeline locality lookup runs only after a user pull-to-refresh while online. No automatic locality retry, polling, or queued resolution.

## Timeline and Performance

- Timeline reads saved records and never mutates business facts.
- Basic Performance reads saved revenue and fuel observations only: completed rides, cancellation fees, fuel spending, full-tank interval fuel cost/km, and income after fuel.
- Do not add targets, forecasts, break-even, provisions, loan amortization, profitability projections, or replacement models.

## Preservation

Retired record stores remain preserved in local recovery/backup data; they are not active Admin forms or calculation inputs. Cleanup must not silently delete user records.
