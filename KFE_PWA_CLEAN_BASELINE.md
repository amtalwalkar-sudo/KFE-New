# KFE PWA Clean Baseline

Status: baseline for UI/UX redesign.

## Purpose

This baseline removes the current presentation layer without changing business behaviour. It is intentionally neutral and temporary.

### Universal baseline rules

- One neutral light presentation across the PWA.
- No light/dark/dusk visual themes.
- No colour-coded UI hierarchy.
- No gradients, glass effects, decorative shadows or ornamental backgrounds.
- No decorative motion or transition effects.
- Simple system typography.
- Simple rectangular controls and surfaces.
- One consistent border treatment.
- Primary actions may use black/white contrast only.
- Status meaning remains in text; colour is not used as the meaning carrier.
- Existing routes, forms, validation, persistence, calculations and workflows remain unchanged.
- Existing Work fixed-cockpit scrolling and fixed swipe mechanics remain unchanged.
- Mobile-first layout remains required.

## Screen-specific baseline rules

### Work

- Preserve the frozen driver workflow and state transitions.
- Preserve the fixed bottom navigation and fixed swipe surface.
- Remove decorative cockpit styling only.
- Keep target/progress/timer and active-state content readable.
- Dynamic state content may scroll only when needed.

### Timeline

- Present records as simple chronological content.
- Use basic headings, lists/tables and neutral record boundaries.
- No visual category hierarchy beyond text structure.

### Performance

- Present Daily/Weekly/Monthly views plainly.
- Keep Actual P/L, Provisional P/L and existing loan/refuelling information intact.
- No dashboard decoration or comparison-heavy visual treatment.

### Admin

- Keep existing modules and forms.
- Use straightforward sections and forms.
- No decorative dashboard cards or colour-coded module hierarchy.

## Next phase

After this baseline is verified, define the final universal UI/UX rules first, then screen-specific rules, then implement the final visual shell and screen designs.
