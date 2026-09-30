# KFE 2.0 Timeline Foundation

Timeline is currently a dormant future presentation capability. The current production shell does not expose a Timeline screen.

## Preserved application concept

When Timeline is rebuilt, it must answer what happened and in what order using authoritative Work and originating ERP module records.

## Horizons
- L1: Day — today's chronological activity.
- L2: Week — the current week's activity.
- L3: Long-term — retained historical activity.

## Event contract
`KFE_TIMELINE_EVENT_V1` remains a future extensibility boundary. Conforming authoritative events can be displayed without a Timeline-specific feature for every future Work recording capability.

Work timestamps remain authoritative. GPS/location is displayed only when captured by the authoritative event. Business/personal scope is preserved and Timeline does not alter accounting.

Timeline must never create, edit, correct, or silently reinterpret source records. Missing or invalid values remain unavailable. Ordering must be deterministic by authoritative occurrence time, then stable event identity.

Break handling is part of the Work domain/application contract and may appear in Timeline when represented by an authoritative event. A future Timeline presentation must remain read-only and must not invent Break events or accounting effects.

Tax Reserve is permanently excluded from KFE 2.0 and is not a Timeline concept.
