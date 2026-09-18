# KFE PWA Visual Application — Layer 1 + Layer 2

**Status: COMPLETE / APPLIED PWA-WIDE**

This document records the one-pass application of the frozen KFE Visual DNA to the complete PWA.

## Governing rule

> KFE has one visual and interaction language. Screens may differ according to their purpose, but they must feel like parts of the same professional system.

The Visual DNA is applied globally first, then expressed by context. Existing business workflows, calculations, information meaning, architecture boundaries and frozen decisions are preserved.

## Layer 1 — Global Visual System

- Typography: readable system sans-serif hierarchy.
- Colour: frozen light and dark semantic palettes.
- Theme: Auto by local device time by default; Light and Dark manual modes are supported by the theme controller. Default Auto schedule is 06:00–19:00 day and 19:00–06:00 night.
- Spacing: 4/8/12/16/24/32/40px scale.
- Radius: 8/12/16/20px according to control/surface importance.
- Touch targets: 48px baseline for mobile controls.
- Surfaces: meaningful grouping only; restrained borders and elevation.
- Actions: primary, secondary, tertiary and destructive hierarchy.
- Status: success/warning/error/info always paired with text/icon/structure.
- Focus: visible and keyboard accessible.
- Motion: fast, subtle, purposeful; reduced-motion support retained.
- Responsive: mobile-first with task hierarchy preserved.
- PWA: safe areas, stable shell, local-first presentation and background-work feedback.
- Data: numbers and units use deliberate hierarchy and tabular numerals.
- Feedback: inline, snackbar/banner/dialog patterns remain purpose-driven.
- Empty/loading/error/offline/sync states inherit common language.
- Privacy and technical metadata remain progressive and contextual.

## Layer 2 — Experience Expression

### Driver Experience

**Work + Timeline**

- Low-density, glanceable, action-led presentation.
- Operational state receives the strongest hierarchy.
- Trip Start/End remains the dedicated swipe interaction.
- Offline/local-save state is prominent but calm.
- Complex data entry is not visually encouraged while driving.

### Performance Experience

**Performance**

- Analytical and comparative.
- Medium information density.
- Metrics receive deliberate numerical hierarchy.
- Tables/metrics may be denser than Driver screens without becoming a separate design language.
- Financial and operational relationships remain distinguishable.

### Admin Experience

**Admin**

- Structured, controlled and data-oriented.
- Higher density is permitted where it improves management.
- Forms, records, filtering and destructive controls inherit the same KFE component logic.
- Read-only, unavailable and destructive states remain visually distinct.

## Existing navigation

The established primary navigation remains:

**Work | Timeline | Performance | Admin**

No navigation or workflow restructuring was introduced by the visual application pass.

## Component inheritance

Existing KFE component families inherit the global system:

- forms and fields
- form actions
- state indicators/panels
- navigation
- record lists
- settings
- backup/restore
- fuel
- financial
- maintenance
- compliance
- vehicle/driver/admin modules
- performance and timeline presentation

New isolated visual languages are not introduced.

## Drift audit

### A — Existing pattern reused
Global tokens, existing semantic component patterns, navigation, forms, feedback and responsive conventions.

### B — Existing pattern extended
Theme token compatibility, global surface/action/status aliases and PWA-wide visual utility patterns.

### C — New capability
A small presentation-only theme controller provides the frozen Auto/Light/Dark behaviour without affecting business calculations or stored records.

### D — Conflict
**None identified in this pass.**

No established KFE business rule, calculation authority, workflow, data meaning or architecture boundary was intentionally changed.

## Implementation boundary

This pass is presentation-layer work. It does not choose or lock:

- OCR provider
- backup provider
- sync provider
- business-rule authority
- calculation authority
- data ownership
- persistence schema

## Future inheritance

Every future KFE feature must:

1. Reuse the global visual system.
2. Identify Driver / Performance / Admin context.
3. Reuse existing patterns before inventing new ones.
4. Extend deliberately when necessary.
5. Check theme, responsive behaviour and accessibility.
6. Run the drift/conflict check.
7. Document genuinely new patterns.

## Completion record

**Layer 1: COMPLETE**  
**Layer 2: COMPLETE**  
**PWA-wide application: COMPLETE**  
**Visual DNA: FROZEN**  
**Design drift detected: NONE**

The source-of-truth Visual DNA remains KFE_VISUAL_DNA.md. This document records its PWA-wide application rather than replacing the governing DNA.