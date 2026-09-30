# KFE Frozen Requirements — Fuel, Ledger, GPS

**Status:** FROZEN  
**Baseline:** `156dad734188bda63472aac394dd26d02b307aa6`  
**Scope:** Business-entry and operational requirements. These requirements are authoritative for subsequent implementation and audit work.

## 1. Work — Fuel entry

The active Work fuel form must retain:

- Odometer
- Price per kg
- Amount
- System-calculated quantity

It must additionally expose a small checkbox:

- `☐ Partial fill`

Semantics:

- **Unchecked:** Full Tank
- **Checked:** Partial Fill

The driver does not manually enter fuel quantity. Quantity remains derived by the system from Amount ÷ Price/kg.

The full/partial-tank fact must be persisted with the authoritative fuel record and remain available to downstream reporting.

## 2. Admin — Finance Ledger

Create a brand-new, **read-only historical Ledger view**.

The structure is:

- **Ledger**
  - Toll
  - Parking
  - Fuel
  - Future ledger categories

Ledger rows must be built from authoritative persisted source records. Financial aggregates, summaries, or reconstructed period totals are not substitutes for historical ledger records.

The Ledger must support the existing KFE-style date navigation/filtering for:

- Day
- Week
- Month

### Ledger dates

- **Toll date:** derived from the authoritative shift date.
- **Parking date:** derived from the authoritative shift date.
- No separate manually entered Toll/Parking date is permitted in Work.

Fuel uses its authoritative recorded timestamp/date.

The Ledger is a historical/read-only record view; editing source records remains governed by their existing authoritative workflows.

## 3. GPS / Location lifecycle

Location tracking must continue across the normal UI lifecycle:

1. Tracking starts during the applicable KFE operational session.
2. Screen may turn off.
3. App may move to the background.
4. Location tracking continues.
5. Tracking stops when the phone itself is switched off, or when the operational session explicitly ends according to KFE business rules.

A normal page-level JavaScript timer or `watchPosition` alone is not sufficient for this requirement because Android may suspend or terminate background page execution.

The implementation must therefore use the appropriate Android background/foreground location mechanism so that the location-tracking lifecycle is independent of the visible KFE screen lifecycle.

Persisted location events must remain available after UI lifecycle changes and must retain the captured timestamp and location data, including place name when available.

## 4. Non-negotiable implementation rules

- Do not replace authoritative source facts with aggregates.
- Do not introduce duplicate manual dates where the business date is already determined by the source record.
- Do not make calculated fuel quantity driver-entered.
- Do not make the Ledger editable.
- Do not treat page visibility/backgrounding as equivalent to ending operational tracking.
- These requirements are frozen until explicitly changed by the product owner.
