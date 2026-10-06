# KFE Stable Functional Baseline

**Status:** AUTHORITATIVE BASELINE RECORD  
**Role:** Top-level stable starting-point record; not a replacement for any domain authority.  
**Repository:** `amtalwalkar-sudo/KFE-New`  
**Baseline implementation reference:** `713d1cbe042c93a47fdba2b9ff00b59498211b6c`  
**Established:** 2026-10-06

---

## 1. Purpose

This document defines the **stable functional starting point of KFE-New**.

It exists so that, at any point in the future, KFE can be rebuilt, audited, repaired, redesigned, or resumed from a known functional baseline without having to reconstruct the intended product foundation from conversation history.

This document is a **baseline map and change-control record**. It does not duplicate the detailed rules owned by the existing authority documents.

The governing principle is:

> **The functional foundation is established and protected; the UI/UX and shell may continue to evolve until explicitly frozen.**

A useful shorthand is:

> **The engine is frozen. The dashboard is not.**

---

## 2. Authority hierarchy

KFE already has a single-source-of-truth system. This baseline does not replace it.

The permanent rule remains:

> **ONE RESPONSIBILITY → ONE OWNER → ONE AUTHORITATIVE SOURCE → ONE IMPLEMENTATION PATH**

See `KFE-AUTHORITY-MAP.md` for the authoritative ownership map.

Detailed domain rules remain in their existing canonical documents, including:

- `KFE_BUSINESS_RULES_REGISTER.md` — business meaning and business rules
- `docs/KFE-CALCULATION-SPECIFICATION.md` — arithmetic and formulas
- `docs/KFE-ARCHITECTURE-CONTRACT.md` — architecture and layer boundaries
- `docs/KFE-CANONICAL-DATA-CONTRACT.md` — canonical data model and data authority
- `docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md` — operational lifecycle/state machine
- `docs/UI-UX-SHELL-CONTRACT.md` — PWA UI/shell/presentation boundary
- `KFE_WORK_COCKPIT_BASELINE.md` — Work cockpit presentation
- `docs/KFE-UNIVERSAL-FORM-STANDARD.md` — universal form architecture
- `docs/KFE-UNIVERSAL-FORM-ACTION-RECOVERY-RULES-FROZEN.md` — action recovery semantics
- `KFE_ANDROID_RELEASE_GATE.md` — Android release acceptance
- `docs/ANDROID-NATIVE-GPS-CONTRACT.md` — native GPS capability

If this document appears to conflict with a canonical authority, the canonical authority wins and this record must be corrected. This document must never become a second source of truth.

---

## 3. What this baseline establishes

The following constitute the **functional foundation represented by this baseline**.

### 3.1 Business-rule foundation

The application uses the canonical business-rule register and its established business semantics.

Business meaning, invariants, calculations, persistence, lifecycle, and presentation are not independently redefined by individual screens.

Future UI work must consume the established business paths rather than creating parallel business logic.

### 3.2 Data and persistence foundation

The application has an established persistence/data-authority architecture.

The baseline protects:

- canonical data ownership;
- persisted state as the authority where required;
- local-first/offline operation where defined by the existing contracts;
- validation before commit;
- duplicate protection;
- recovery/interruption semantics;
- read models as consumers rather than competing authorities.

### 3.3 Work functional foundation

The Work cockpit follows the established driver workflow:

**OFFLINE → Start Shift → Gap Gate → Online/Ready → Go to Pickup → Ready for Trip → Trip Active → Trip Complete → Next Pickup → End Shift → Reconciliation → Shift Review → Shift Ended**

The existing Work authority remains the detailed source of truth.

The baseline specifically protects the established functional semantics around:

- shift start and odometer gap handling;
- Personal KM / Dead KM allocation at shift start;
- trip KM and Dead KM allocation;
- trip lifecycle;
- trip completion;
- fare entry;
- cancellation;
- reconciliation;
- end-shift flow;
- persisted/interruption-safe state.

### 3.4 Authoritative swipe surface

The Work swipe surface remains the authoritative interaction surface for:

- **Go to Pickup**
- **Start Trip**
- **End Trip**

Frozen semantic colours are:

- **blue** → Go to Pickup
- **green** → Start Trip
- **red** → End Trip

The previously frozen swipe mechanics are part of this functional foundation and must not be silently changed during UI/UX work.

This includes the established handle size, threshold, return behaviour, finger tracking, safe zones, and interruption/start-off-handle behaviour.

The PWA swipe surface and Android native overlay are separate presentation surfaces. They must remain functionally aligned without creating separate business authorities.

### 3.5 Android/native foundation

The native Android overlay and native supporting services are part of the established application foundation.

The baseline recognizes:

- the native overlay service;
- the native swipe/action surface;
- native GPS capability;
- native lifecycle/recovery support;
- notification capability;
- the bridge back to the canonical Work/business path.

Visual changes to the PWA do **not** automatically change native Android presentation. PWA/native visual parity is therefore protected by the established parity contract/audit rather than by duplicating CSS into native code.

### 3.6 Driver target foundation

The established Driver Target behaviour remains part of the functional foundation, including:

- target;
- progress;
- elapsed timer in the established `hh:mm:ss` form;
- persisted/local-first state requirements;
- validation and duplicate protection;
- safe early-release behaviour;
- independent swipe/overlay relationship;
- accessibility-equivalent interaction requirements.

### 3.7 Forms foundation

The baseline includes the established form architecture and resilience rules.

This includes, where applicable:

- keyboard-safe entry;
- numeric keyboard behaviour;
- Enter/Next/Done navigation;
- visible inputs above the keyboard;
- immediate post-action forms where required;
- commit/recovery semantics;
- cancellation and correction behaviour;
- no unnecessary scrolling in the frozen compact Work forms.

The detailed field definitions remain owned by their respective domain/form authorities.

### 3.8 Finance, performance and calculation foundation

The established calculation and financial semantics remain part of the functional baseline.

In particular, the baseline includes the existing authoritative treatment of:

- Actual Profit/Loss;
- Provisional Profit/Loss;
- full EMI expense treatment;
- day/week/month views;
- Business Start Date boundaries;
- loan position/timeline;
- refuelling;
- driver target;
- provisions and their payment/emptying semantics;
- authoritative maintenance treatment;
- indicative maintenance-per-KM treatment;
- pre-business loan recovery.

The calculation specification and business-rule register remain the detailed authorities.

### 3.9 Theme foundation

The canonical theme architecture is part of the baseline.

The application has a single canonical theme source/controller rather than competing palette systems.

Day/night presentation is controlled through the established theme mechanism and canonical tokens.

Future visual redesigns may refine the presentation, but they must not reintroduce competing theme/palette authorities.

### 3.10 PWA/native visual parity foundation

The PWA and native Android swipe surfaces have an explicit visual-parity protection mechanism.

The parity contract protects the agreed semantic relationship between:

- action meaning;
- action colour;
- surface;
- text;
- muted text;
- relevant frozen native swipe geometry/mechanics markers.

This is a **parity guard**, not a second UI authority.

---

## 4. What is deliberately NOT frozen as final UI/UX

The current visual presentation is intentionally a **basic/baseline shell**.

The following remain open for future UI/UX work unless separately and explicitly frozen:

- final visual design;
- final shell styling;
- typography refinement;
- card/panel treatment;
- spacing and density refinement;
- visual hierarchy refinement;
- screen layout improvements;
- placement of components;
- animation polish;
- final visual treatment of the Work cockpit;
- final visual treatment of other application screens.

The fact that these areas remain open does **not** mean the functional foundation is incomplete.

A future screen may be substantially redesigned while retaining the same underlying functional contract.

---

## 5. UI/UX change-control rule

UI/UX changes are allowed without reopening the functional baseline **provided the underlying functional authorities remain unchanged**.

There are two distinct cases.

### 5.1 Layout change / experiment

If a screen is rearranged, simplified, restyled, or repositioned for exploration, it is an implementation change only.

It does not automatically become a new frozen rule.

### 5.2 Approved/frozen UI/UX change

When an explicit instruction is given to **document/freeze/establish** a UI/UX or layout decision, the baseline record may be updated.

The update should record only:

1. what changed;
2. what screen/surface it affects;
3. whether the change is basic, approved, or final;
4. what functional behaviour remains unchanged;
5. the implementation commit/evidence where useful.

The detailed functional rules must not be copied into this document.

This prevents duplicate sources of truth.

---

## 6. Baseline change rule

A change to the functional foundation is different from a visual/layout change.

A permanent functional rule change must follow the existing governance path:

**Authority Map → affected canonical authority → contract/test/golden evidence → implementation**

This baseline record is then updated to reflect the new stable baseline.

A UI/UX change must not silently change:

- business meaning;
- calculation authority;
- data authority;
- lifecycle/state semantics;
- frozen swipe mechanics;
- persistence/recovery authority;
- native/PWA business-state ownership.

If one of those changes is intended, it is a functional change and must be handled through the appropriate canonical authority.

---

## 7. Baseline evidence

The baseline implementation reference is:

`713d1cbe042c93a47fdba2b9ff00b59498211b6c`

This commit represents the repository state immediately before this baseline record is added and includes the current PWA/native swipe visual-parity implementation and its contract registration.

Previously established release evidence includes the green production/deployment baseline at commit:

`a018d08e3252260ee84472a4a0fa9b5582923abf`

with CI run #2897 (run ID `37391839503`) reported successful.

The current parity additions after that earlier green run must be treated according to the repository's normal CI/evidence rules; this document does **not** claim that a later automated or physical-device gate has passed merely because the source exists.

CI success, an APK artifact, or source inspection alone does not replace any required physical-device/runtime evidence.

---

## 8. Physical-device evidence boundary

This baseline is the **functional repository starting point**, not a claim that every real-world Android/device scenario has already been exhaustively proven.

The controlled physical-phone validation remains a separate evidence gate in the prelaunch process.

Where a future gate requires:

- physical phone interaction;
- Android overlay behaviour;
- permissions;
- background/screen-off behaviour;
- interruption/restart behaviour;
- real GPS behaviour;
- production APK installation/update behaviour;

that evidence must actually be obtained and recorded.

This keeps the baseline honest while still giving the project a stable starting point.

---

## 9. How this record is used in the future

At any future point, the question:

> **“What was the stable functional starting point of KFE?”**

should be answerable from this document plus the canonical authority documents it references.

The question:

> **“What does this particular business rule mean?”**

should still be answered by the relevant domain authority.

The question:

> **“What did we visually freeze on a particular screen?”**

should be answered by the relevant UI/UX/shell authority and the approved baseline change entry here.

The question:

> **“What exact code established this baseline?”**

should be answered by the baseline commit reference and repository history.

---

## 10. Baseline principle

KFE is now intended to move forward from a known foundation rather than repeatedly rediscovering its product definition.

The operating model is:

**Stable functional foundation → controlled UI/UX evolution → explicit UI/UX freezes → final presentation**

The visual shell may change substantially.

The underlying application contract may not change silently.

> **This document is the stable starting-point record. It is maintained deliberately, without duplicating the detailed authority documents.**
