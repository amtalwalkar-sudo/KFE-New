# KFE 2.0 Timeline Foundation

Timeline is an active production reporting surface at `/timeline`. It presents canonical Work and ERP records by IST day, week, month and personal-use views. It is a read model and correction entry point, not a business-data or calculation authority.

## Preserved application concept

Timeline must answer what happened and in what order using authoritative Work and originating ERP module records. Its day/week/month aggregations must filter records by the correct event/period boundary, not merely by the shift start date.

## Horizons
- L1: Day — today's chronological activity.
- L2: Week — the current week's activity.
- L3: Long-term — retained historical activity.

## Event contract
`KFE_TIMELINE_EVENT_V1` may remain an extensibility boundary, but it does not replace the current canonical record contracts. New event types must map to authoritative records without creating Timeline-specific business data.

Work timestamps remain authoritative. GPS/location is displayed only when captured by the authoritative event. Business/personal scope is preserved and Timeline does not alter accounting.

Timeline must never create, edit, correct, or silently reinterpret source records. Missing or invalid values remain unavailable. Ordering must be deterministic by authoritative occurrence time, then stable event identity.

Break handling is part of the Work domain/application contract and may appear in Timeline when represented by an authoritative event. Timeline remains read-only for business authority; corrections are submitted through canonical application services and audited. It must not invent Break events or accounting effects.

Tax Reserve is permanently excluded from KFE 2.0 and is not a Timeline concept.
