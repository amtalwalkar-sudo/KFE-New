# KFE PWA Theme Compliance Audit

**Status:** Enforced in CI  
**Scope:** PWA presentation/theme layer only

## Audit result

The PWA now has one canonical visual theme source: `src/styles/kfe-ui.css`.

The audit found and removed three competing/obsolete palette sources:
- `src/styles/glassmorphic-polish.css`
- `src/styles/theme-adaptation.css`
- `src/assets/styles/tokens.css`

The active shell no longer imports the glassmorphic layer. Form, finance, Work, and baseline shell presentation styles were also changed to consume canonical KFE theme tokens rather than fixed palette fallbacks.

## Theme rule

KFE supports **Dark theme only**. `src/presentation/theme/kfeThemeController.js` forces and persists `dark` in `kfe.visual.theme.mode`, migrating any legacy `light` or `auto` preference to `dark`. Device `prefers-color-scheme` must not affect the app palette. Shared presentation styles consume the canonical `--kfe-ui-*`, semantic status, spacing, radius, and sizing tokens; the canonical stylesheet owns the dark palette and individual screens must not define their own theme.

Business rules, calculations, persistence, repositories, Work state transitions, form submission semantics, frozen swipe mechanics, and native Android behavior are outside this audit and were not changed.

## Permanent guard

`npm run ui:theme-audit` now checks:
1. canonical theme stylesheet imports;
2. absence of competing palette imports/files;
3. canonical light/dark token definitions and supported mode resolution;
4. fixed non-semantic colour literals in CSS;
5. fixed RGB/RGBA palettes outside the canonical theme;
6. component-local `<style>` blocks;
7. local redefinition of canonical theme tokens.

The same audit is included in `npm test` through `themeCompliance.contract.js`.

## Runtime coverage

The existing Phase 4 runtime visual verification checks theme changes through the canonical `kfe.visual.theme.mode` setting and verifies that the shared `--kfe-ui-bg` token changes between resolved modes. Application Settings also exposes a persisted Notifications preference through `ApplicationSettingsService`. This preference is kept separate from the native Work action bridge; it does not reintroduce the retired ride-notification feature.

**Conclusion:** future theme changes are now governed as a PWA-wide presentation concern rather than as independent screen palettes.
