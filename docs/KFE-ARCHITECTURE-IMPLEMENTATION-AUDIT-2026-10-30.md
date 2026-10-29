# KFE Architecture and End-to-End Wiring Audit — 2026-10-30

**Status:** SUPPORTING AUDIT EVIDENCE — NOT AN AUTHORITY  
**Repository:** `amtalwalkar-sudo/KFE-New`  
**Branch under correction:** `fix/simple-four-event-gps-capture`  
**Scope:** Source-of-truth governance, application-flow contracts, GPS/location ownership, Compliance provision rule consistency, and cross-runtime ownership risks.

Cross-layer review acknowledgement is recorded in PR #412; that acknowledgement is governance evidence only and does not substitute for passing CI or physical-device acceptance.

This report records findings from source inspection and the corrective changes made during this run. It does not replace `KFE-AUTHORITY-MAP.md`, `KFE_BUSINESS_RULES_REGISTER.md`, the architecture contract, canonical data contract, calculation specification, or UI/shell contract.

## Confirmed findings and corrections

### KFE-AUD-001 — Phase 6 application-flow contract was stale and not executed

**Finding:** `src/tests/phase6ApplicationFlows.contract.js` referenced obsolete/missing `TimelineView.vue` and `timelineService.js` paths and expected old UI text. The canonical runner `src/tests/runAllContracts.js` did not register the suite, so the stale contract did not protect the current application flow.

**Correction:** Repointed the contract to the actual Work, Timeline, Performance, and Admin views/services and registered it in the canonical runner. The contract checks that presentation views do not own IndexedDB persistence, Timeline stays cache-only during normal reads, locality resolution is user-triggered, and GPS remains limited to four ride events.

**Verification:** Latest CI must pass on the resulting commit before this correction is marked verified.

### KFE-AUD-002 — Manual-only locality resolution had misleading retry state

**Finding:** `locationNameService.js` returned `RETRY_SCHEDULED` when a lookup failed or had no locality match, despite the accepted design having no automatic locality retry queue. A forced refresh could also fail while leaving an older cached locality label in place.

**Correction:** Removed the misleading retry state. Failed forced refreshes now invalidate the cached label for that coordinate. The Timeline read model continues to show only a cached resolved locality or “Location unavailable”; network resolution remains explicit user action.

**Verification:** The Phase 6 contract now asserts that automatic-retry state is absent and stale cache invalidation is present. Latest CI is the required executable proof.

### KFE-AUD-003 — GPS contract contradicted the approved Timeline refresh behavior

**Finding:** The native GPS contract prohibited reverse geocoding and area-name display without distinguishing native collection from user-triggered Timeline enrichment. That contradicted the accepted manual pull-to-refresh behavior.

**Correction:** Clarified the boundary: native capture remains offline, one-shot, and network-free; Timeline may resolve saved coordinates only on explicit pull-down while online. Locality is display-only enrichment, never business data. Failed/unresolved lookups must not fabricate a name, and cancellation location must not appear as a passenger drop-off.

### KFE-AUD-004 — Business-rule authority incorrectly listed Compliance as a cumulative provision bucket

**Finding:** The business-rule register listed EMI, Maintenance, and Compliance as cumulative provision buckets, conflicting with the previously accepted requirement to remove cumulative Compliance provision and its wiring/UI.

**Correction:** The authoritative register now lists only EMI and Maintenance as cumulative provision buckets. Compliance remains a date/validity-based planning concern; actual compliance payments remain actual transactions. The supporting calculation matrix was clarified so renewal planning and daily cash-reservation guidance cannot be misread as a cumulative Compliance bucket.

**Verification:** Existing calculation evidence asserts that the performance engine does not expose `complianceProvisionAccumulatedById`; the Phase 6 contract also guards the authority text and Compliance view. Latest CI is required.

## Remaining architecture risks — not silently marked complete

### KFE-AUD-OPEN-001 — Native SQLite and PWA IndexedDB are separate physical stores

The PWA repositories persist to IndexedDB; the Android overlay uses native SQLite through `KfeCanonicalWorkStore`. Event GPS reads can combine local repository snapshots with native snapshots through `EventLocationService` / `CanonicalWorkBoundary`.

This is a deliberate cross-runtime integration boundary, not literal single-database storage. During this run, the architecture and canonical-data authorities were clarified to state that KFE has one logical canonical model: browser-only commands commit through IndexedDB, while Android Work/overlay commands commit through native SQLite and synchronize the PWA IndexedDB projection. Convergence, precedence, replay, duplicate prevention, and failure recovery remain integration requirements. Do not remove either persistence path as a cosmetic simplification: the Android overlay must continue to work while the PWA WebView is inactive.

### KFE-AUD-OPEN-002 — Full-shift operation while PWA is closed remains a source-level gap

The native overlay service explicitly treats shift start/end as PWA-owned, while `docs/requirements/NATIVE_OVERLAY_FULL_SHIFT_WORKFLOW.md` requires a complete shift workflow without reopening the PWA. This mismatch is recorded in the 2026-10-19 cross-surface audit and remains outside the safe scope of the GPS/location corrections in this run. It needs a dedicated command-boundary implementation that reuses the existing domain lifecycle and odometer/reconciliation rules; a second native business implementation is not acceptable.

### KFE-AUD-OPEN-003 — Work presentation is not fully decoupled from workflow orchestration

`WorkModuleView.vue` owns substantial transient workflow/form state and dispatches commands through the Work store/services. Some form-level numeric checks are duplicated for immediate user feedback. The durable/business authority remains in the domain/application/store path, but this source is not a fully thin presentation adapter. Any further extraction must preserve the frozen workflow and recovery behavior and be proven by Golden Ride/replay contracts; do not perform a broad rewrite without those tests.

### KFE-AUD-OPEN-004 — Physical-device GPS acceptance is still outstanding

Repository CI cannot prove real-device location permission behavior, screen-off/background capture, service restart recovery, or all four event snapshots on the target phone. These remain explicitly unverified until the exact tested APK is exercised offline on a physical Android device.

## Current conclusion

- **Single-source-of-truth governance:** the authoritative documents define distinct ownership, but the four corrections above were necessary because enforcement and supporting text had drifted.
- **Contradictions:** confirmed and corrected in the Phase 6 contract wiring, locality retry semantics, GPS contract, and cumulative Compliance provision rule.
- **Uncoupling:** **not complete**. Native/PWA persistence convergence, full-shift native capability, and the Work view's orchestration responsibilities remain explicit risks.
- **Release status:** do not merge until CI for the final branch head is green. Physical-device acceptance remains pending regardless of CI.
