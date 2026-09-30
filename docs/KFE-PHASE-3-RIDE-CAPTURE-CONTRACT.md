# KFE Phase 3 — Ride Capture & Ingestion Contract

**Phase:** 3 — Ride Capture & Ingestion  
**Status:** Working contract  
**Calendar timezone:** `Asia/Kolkata` (IST)

## Frozen inputs

Phase 3 implements the already-frozen Ride Capture design: screenshots from multiple operator apps feed a provider-independent multimodal extraction boundary; KFE validates the extraction; the user reviews/confirms; then the existing canonical Trip repository persists the record.

The multimodal/OCR provider is deliberately not selected in this phase contract. A provider adapter may be replaced without changing canonical Trip persistence or the application flow.

## Flow

```text
ride screenshot
      ↓
provider-independent extraction adapter
      ↓
extracted candidate
      ↓
KFE normalization + validation
      ↓
review / confirmation
      ↓
canonical Trip repository
      ↓
mutation + audit + canonical-data-changed
```

## Extraction contract

The adapter can return:

- operator;
- status (`COMPLETED` or `CANCELLED`);
- pickup;
- drop;
- ride start time;
- ride end time;
- duration when supplied;
- ride distance in km;
- fare;
- cancellation reason when applicable.

Duration is derived from validated start/end timestamps when the extraction does not provide it. It is a review/presentation value and does not become an independent business authority.

## Validation

Before persistence, KFE requires operator, pickup, drop, valid start/end timestamps, non-negative finite distance, and non-negative finite fare. End time cannot precede start time. Unsupported status values are rejected.

Extracted distance and fare retain OCR/multimodal provenance. Manual corrections remain distinct and are handled by the canonical Trip correction path.

## Persistence boundary

There is no separate Ride Capture business store. Confirmation uses the existing canonical Trip repository and therefore preserves the frozen Trip identity, shift relationship, status lifecycle, revenue authority, mutation/audit lineage, and calculation ownership.

Cancelled rides use the canonical cancellation path rather than deletion.

## Operators and layouts

Operator-specific page layouts are adapter concerns. Uber, Ola, Rapido, or additional operators must not require changes to the canonical Trip model or calculation authorities.

## Exit condition

A screenshot can be passed through an injected extraction provider, validated into the KFE canonical candidate shape, reviewed/confirmed, and persisted as the existing canonical Trip record without selecting or coupling KFE to a specific multimodal/OCR provider.
