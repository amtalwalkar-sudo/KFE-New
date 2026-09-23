# KFE Phase 4 — Runtime Visual Verification

## Status

**COMPLETE — CI-gated runtime verification implemented.**

This phase is the post-Phase-3 runtime verification pass. It validates the built PWA in a real Chromium runtime rather than relying only on source contracts or a successful build.

## Verified subsections

### 4A — Shell and route experience
- Work, Timeline, Performance, and Admin routes are loaded from the production build.
- Kanishka Enterprises shell branding is present.
- Primary navigation remains available.
- Performance continues to honor its route-level header metadata.
- Mobile and desktop layouts are checked for horizontal overflow.
- Runtime screenshots are captured for all four production surfaces.

### 4B — Work cockpit interaction boundaries
- Compact CNG refuelling icon opens the refuelling form while Offline.
- Refuelling form can be closed without entering Online mode.
- Online/Offline control opens the Start Odometer gate.
- Start Odometer flow exposes a Back action.
- No business/calculation authority is changed by the runtime gate.

### 4C — GPS status
- Browser geolocation is supplied through a deterministic test device position.
- The shell GPS control reaches the connected state.
- The control remains icon-only while exposing an accessible label/title.

### 4D — Theme runtime
- Explicit Light resolves to the day palette.
- Explicit Dark resolves to the night palette.
- Auto resolves to a valid day/night state using the existing theme schedule controller.
- The runtime verifies that Light and Dark expose distinct visual token values.

### 4E — Accessibility and responsive behavior
- Reduced-motion media is enabled for the runtime pass.
- Visible interactive controls are checked for accessible names.
- Mobile and desktop viewports are exercised.
- Horizontal overflow is treated as a runtime failure.

### 4F — Canonical/Synthetic data safety
- Canonical IndexedDB is created during normal startup.
- Synthetic IndexedDB is not created merely by canonical startup.
- The physical database names remain distinct.
- The existing Phase 4 persistence/data-isolation contract remains part of the full contract suite.

## CI evidence

The consolidated CI workflow now runs:

1. Full contract suite.
2. Production PWA build.
3. Capacitor sync.
4. Android debug APK build.
5. Existing hardening/release gate.
6. Existing Pages artifact validation.
7. Existing runtime smoke.
8. **Phase 4 runtime visual verification.**
9. **Phase 4 runtime screenshots uploaded as a CI artifact.**
10. GitHub Pages deployment on main.

## Boundary

This phase verifies the built application can actually render and exercise the frozen UI/runtime boundaries. It does **not** change the frozen calculation engine, finance authority, synthetic calculation model, or canonical business rules.

## Exit condition

**PHASE 4 RUNTIME VERIFIED** when the Phase 4 Playwright pass is green and the complete CI workflow remains green.
