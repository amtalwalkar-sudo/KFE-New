# KFE Architecture Contract

**Status:** AUTHORITATIVE
**Purpose:** Single human-readable authority for KFE ownership, boundaries, data authority, replaceability and implementation constraints.

This document defines architecture and ownership boundaries. Product scope and business meaning, including the supported basic Performance calculations, belong to `KFE_BUSINESS_RULES_REGISTER.md`.

## 1. Governing architecture rule

> **ONE RESPONSIBILITY → ONE OWNER → ONE AUTHORITATIVE SOURCE → ONE IMPLEMENTATION PATH**

KFE must not accumulate parallel implementations merely because historical versions contained them.

### 1.1 Consolidation / keep-one rule

> **IF TWO IMPLEMENTATIONS PERFORM THE SAME RESPONSIBILITY, KEEP ONE CANONICAL IMPLEMENTATION AND DELETE OR NEUTRALIZE THE OTHER.**

This is a permanent KFE implementation rule.

- Identify all implementations performing the same responsibility.
- Keep exactly one canonical implementation/path for that responsibility.
- Delete genuinely redundant implementations and obsolete references in the same run.
- If an apparent duplicate is required only as UX, compatibility glue, adapter wiring or another explicitly distinct responsibility, it must not become a second business/data authority.
- A UI constraint may remain for user experience, but it must not duplicate or redefine authoritative business validation.
- Do not retain duplicate code merely because it is harmless, historical, convenient, or currently unused.
- After consolidation, search again for stale references and verify the surviving path with tests/build.

## 2. Layer direction

```text
Presentation
    ↓
Application use cases / orchestration
    ├── Domain rules and calculations
    └── Repository boundary
             ↓
       Persistence adapters
          ├─ Browser PWA: IndexedDB
          └─ Android Work/GPS: SQLite

Infrastructure platform adapters implement application-owned runtime ports.
The composition root selects those adapters; the application never imports them.

ONE LOGICAL CANONICAL STATE — DURABLE PLATFORM STORES MUST CONVERGE
```

Any external provider used by an explicitly approved current capability sits behind an infrastructure adapter.

## 3. Ownership

| Responsibility | Owner |
|---|---|
| Business entities | Domain |
| Business rules | Domain |
| Calculations | Domain |
| Invariants | Domain |
| Use cases | Application |
| Workflows/orchestration | Application |
| Persistent business records | Authoritative persistence |
| Database access | Persistence |
| Repository contracts | Application/persistence boundary |
| UI state | Presentation |
| Screens/layout | Presentation |
| Forms | Authoritative form system |
| Shell | One authoritative shell |
| Backup/restore | Persistence + infrastructure boundary |
| Sync | Persistence + infrastructure boundary |
| Android/native capability | Capacitor/native boundary |
| Cloud/backup provider | Infrastructure |
| Notifications | Infrastructure/native boundary |

No layer may silently assume ownership already assigned to another layer.

## 4. Basic Performance calculation boundary

- Only the recorded-data calculations explicitly defined in `KFE_BUSINESS_RULES_REGISTER.md` are in scope.
- Presentation consumes the basic Performance read model rather than reproducing formulas.
- Application coordinates the read model and does not introduce additional financial models.
- Provider adapters never calculate KFE business meaning.
- Historical calculation registries/specifications do not authorize additional product behavior.

## 5. Data authority

Every business fact has one authoritative source.

Example:

```text
Authoritative persisted ride record
        ↓
application/domain derivations
        ↓
presentation/read models
```

UI state, temporary extraction state, caches, projections and notifications are not competing authorities.

Derived values must be reconstructable from authoritative persisted records wherever deterministic reconstruction is possible.

## 6. Persistence boundary

- Local KFE data is authoritative and local-first.
- KFE has one **logical canonical state and business/data contract**, not one physical database shared across browser and Android runtimes.
- In browser-only operation, IndexedDB is the local durable commit store. On Android, Work and overlay commands use native SQLite as the durable commit authority; IndexedDB is synchronized as the PWA projection/read model.
- A command is not committed merely because a UI or queue accepted it: the runtime's authoritative durable commit must be acknowledged before success is surfaced.
- Cross-runtime replay uses stable record/event/operation identity, idempotency checks, stale-write protection, and explicit convergence. Neither store may independently redefine business meaning or calculate a competing result.
- Business/domain/application layers must not depend directly on a particular cloud/backup provider.
- Persistence is accessed through repository/canonical-command contracts.
- Backup/restore and sync operate against the logical canonical model rather than becoming alternate business-data authorities.
- Raw authoritative records remain recoverable.

## 7. Provider independence

The following are replaceable infrastructure concerns:

- cloud backup provider
- sync provider
- native storage capability
- notification implementation
- external services

The dependency direction is:

```text
KFE business/domain
        ↓
KFE application/contracts
        ↓
infrastructure adapter
        ↓
provider
```

Business logic must never become provider-specific.

### 6.1 Runtime ports and composition root

The application owns the runtime-port contracts; infrastructure supplies their implementations.

```text
src/main.js (single composition root)
        ↓ installs once, before Vue mount
src/infrastructure/work/workRuntimeAdapter.js
        ↓ implements
src/application/work/workRuntimePorts.js (application-owned port contracts)
        ↓ consumed by
application use cases
```

- Application modules may import application-owned port contracts, but must not import concrete infrastructure adapters, Capacitor packages, browser APIs for platform capabilities, or native plugin instances.
- The composition root is the only place that chooses and installs runtime implementations. It must install them before router construction or screen setup can call a port.
- Browser and Android implementations are adapters behind the same application contract; a port must not contain platform branching or business rules.
- The machine-readable layer registry allows Infrastructure to import the application-owned port contract for binding; it does not allow Application to import Infrastructure. This is dependency inversion, not a circular runtime dependency.

## 7.1 Capacitor plugin registration

- `src/infrastructure/capacitor/nativePluginRegistry.js` is the only JavaScript module allowed to import `@capacitor/core` or call `registerPlugin()`.
- Android capability adapters consume the registered plugin instances and translate them into narrow KFE infrastructure services.
- Presentation, application and domain layers must never import Capacitor plugins or register native plugins.
- Adding or replacing a native plugin requires updating the registry and the architecture contract test; it must not create a parallel registration path.

## 7.2 PWA and Android runtime ownership

- `src/main.js` is the single JavaScript composition root. It installs runtime ports, mounts the Vue application, and starts the post-mount bootstrap once.
- `src/infrastructure/capacitor/nativePluginRegistry.js` is the sole JavaScript plugin-registration point. `MainActivity` registers the matching native plugin classes once. The architecture contract test compares both registration lists and fails on missing, duplicate, or extra plugin registrations.
- `PlatformStartup` owns browser service-worker registration; no view, store or other startup module registers another service worker.
- `StartupService` owns canonical IndexedDB initialization and recovery ordering. Startup and permission-gate application services publish plain state snapshots; `src/presentation/startup/useStartupUiState.js` owns Vue reactivity and subscribes to those snapshots. Application services must not import Vue/Pinia or expose framework-reactive state.
- On browser PWA, IndexedDB is the durable canonical store. On Android, SQLite is the durable Work/GPS event store; IndexedDB is the synchronized PWA read model. Stable IDs, idempotent operations and explicit acknowledgements preserve one logical record history.
- Native overlay commands are Android capability commands. Shift start/end remain PWA-owned. Native ride commands are constrained to the active canonical shift and are replayed/acknowledged through the durable native event journal.
- Domain code owns the semantic definition of recorded Shift revenue. Android SQLite may mirror that exact deterministic rule inside its native transaction because overlay fare/cancellation submissions must remain durable while the WebView is closed. This is a persistence projection only: it may not introduce a second inclusion rule, metric, or financial authority. The native store must use one projection helper for every Trip write/form commit, and parity tests must compare it with the domain rule.
- Native GPS collection owns only the four event-time coordinate snapshots. It does not own ride timestamps, locality labels, ride distance or Timeline presentation.
- Dropbox backup runs in the live app/WebView context only; no service-worker or native background polling is used.
- `App.vue` owns permission-gate and runtime-error presentation. Its reactive state comes from the presentation startup composable. `main.js` configures the Vue error handler and dispatches a runtime-error event; it does not construct fallback presentation DOM.
- App presentation uses the shared presentation stylesheets. Do not add inline `style` attributes or component-local `<style>` blocks to App, views or app components.

### 7.3 GPS and locality retry ownership

- Native Android owns event-time coordinate capture at exactly `PICKUP_START`, `TRIP_START`, `TRIP_END` and `TRIP_CANCELLED`; no continuous tracking or GPS-derived ride distance is permitted.
- The native journal is committed before location acquisition. A bounded 30-second request may accept the first valid fix at 75 metres or better; a valid fix without accuracy metadata may be stored but is not eligible for locality lookup.
- If capture fails, stop active location requests and retain the pending event. Resume only on a later ride event, app open, or explicit GPS-status refresh. Never schedule a timed/idle GPS retry.
- GPS capture never initiates locality resolution or polls for a newly captured snapshot. PWA locality resolution is initiated only by the explicit Timeline pull-to-refresh action, for eligible unresolved snapshots. No connectivity polling, automatic locality attempt, locality retry timer, or background geocoding queue is allowed.
- Timeline pull-to-refresh is the single manual entry point for unresolved eligible snapshots across all four event types. Display semantics remain separate: pickup uses `PICKUP_START`, completed drop uses `TRIP_END`, and cancellation is never presented as a passenger drop-off.

## 8. Work and event capture boundary

Work capture is an operational workflow, not a new business-data authority.

```text
PWA Work screen
        ↓
WorkService + Domain rules
        ↓
Browser IndexedDB / Android SQLite adapter

Android ride overlay (WebView may be closed)
        ↓
Native overlay command service + bounded native invariants
        ↓
Android SQLite canonical records + durable native event journal
        ↓
PWA event replay / acknowledgement → IndexedDB projection

Timeline / basic Performance read the canonical PWA application model
```

- Shift start/end are PWA-owned. PWA Work actions use WorkService; Android overlay ride actions use the native command adapter because the WebView may be unavailable. Both mutate the same canonical Shift/Trip model and must preserve the same lifecycle invariants; there is one record history, not two.
- PWA fare/cancellation/fuel forms use the Work application-service/repository path. Android overlay fare/cancellation forms use the single native SQLite transaction boundary documented in `docs/NATIVE-TRIP-FORM-TRANSACTION.md`; the PWA replays the durable event to synchronize and acknowledge, not to create a second commit. Native input and persistence guards are bounded to the same canonical validation rules.
- UI forms do not write canonical records directly; the native overlay calls the native command/persistence adapter, not the database from a view/widget.
- Timeline is read-only. It does not capture GPS or mutate Work records.

## 9. Change isolation / bounded impact

Every change should have a clear owner and bounded dependency surface.

A UI/UX change should not require rewriting domain calculations.

A calculation change should not require changing persistence providers.

A provider change should not change business meaning.

A backup-provider change should not change domain/application contracts.

A presentation change must not silently create a second shell, state authority or calculation path.

## 10. One shell / one presentation authority

KFE must have one authoritative production shell/layout ownership path.

Do not retain duplicate legacy shells, navigation systems or hidden fallback presentation implementations merely for compatibility.

Presentation contracts define presentation behavior; historical UI documents are not implementation authority unless explicitly retained as current contracts.

## 11. Repository and service rules

- No duplicate repository for the same authoritative record type.
- No direct infrastructure access from domain calculations.
- No browser/native/provider lifecycle code inside domain logic.
- No UI-owned persistence authority.
- No duplicate calculation service that can produce a competing answer.
- If a service is replaced, references to the obsolete implementation are removed in the same run.
- The consolidation / keep-one rule in §1.1 applies to every implementation path, not only repositories and services.

### 11.1 Admin form and data path

The one active Admin source-record path is:

```text
AdminView / AdminSourceForm (presentation)
        ↓
AdminService + form definitions + validation (application)
        ↓
AdminRepository (canonical persistence boundary)
        ↓
IndexedDB canonical stores + mutation/audit records
```

- AdminView owns navigation, transient selection, loading/error state and form orchestration only.
- AdminSourceForm owns input rendering and non-authoritative draft recovery through FormDraftService; it does not write canonical business records.
- AdminService is the single owner of Admin form normalization/validation and use-case orchestration.
- AdminRepository must not import application form definitions or validation. It owns canonical transactions, relationship integrity, soft deletion, mutation records and audit history.
- Parent/child relationship checks and record deletion must occur in the same repository transaction.
- Admin forms store source facts only. Loan principal, tenure and rate are saved facts; Admin does not calculate EMI, amortization, repayment schedules or payment allocation.
- Backup/restore remains a separate persistence workflow and must preserve legacy stores without exposing retired workflows in Admin.

## 12. Replace-and-delete rule

When obsolete implementation is identified:

```text
IDENTIFY
  ↓
CHECK REFERENCES / DEPENDENCIES
  ↓
VERIFY REPLACEMENT
  ↓
WIRE REPLACEMENT
  ↓
DELETE OBSOLETE IMPLEMENTATION
  ↓
DELETE OBSOLETE REFERENCES
  ↓
SEARCH AGAIN FOR STALE REFERENCES
  ↓
RUN TESTS / BUILD
```

> **REPLACE AND DELETE — SAME RUN.**

This applies to obsolete services, repositories, adapters, shells, service workers, routes, components, storage paths, provider paths, configuration and compatibility code.

## 13. Contracts and field authority

Each important record should have:

- one authoritative identity;
- defined required/optional fields;
- lifecycle/status rules;
- validation ownership;
- persistence ownership;
- calculation dependencies where relevant.

A field must not be given conflicting meanings by different modules.

## 14. Application boundary

Application services orchestrate use cases and workflows.

They may:

- load authoritative records;
- call domain calculations;
- validate workflow preconditions;
- persist changes through repositories;
- produce application read models.

They must not create a second business-rule implementation merely to simplify a screen.

## 15. Presentation boundary

Presentation may:

- collect input;
- render authoritative/read-model data;
- maintain transient UI state;
- communicate validation/recovery status.

The Work-only timer identity and interrupted-form session marker live in `src/presentation/workflowUiState.js`. They are non-authoritative UI restoration hints only; field drafts use the form-draft application/repository path, and canonical Shift/Trip state is always reconstructed from authoritative records.

Presentation must not:

- become the source of truth;
- persist competing business records directly;
- duplicate financial/business formulas;
- silently reinterpret domain meaning.

## 16. Recovery and reconstruction

KFE must be recoverable by reconstruction from authoritative persisted state.

If UI state disappears, a process dies, the network disappears, a provider fails, or a cache is lost, KFE must reconstruct correct business state from authoritative records.

Hidden transient state must not be required to recover business truth.

## 17. Backup / restore / sync architecture

- Local-first data remains available on-device.
- Full transferable backup/restore is supported.
- Cloud backup is an infrastructure concern.
- Sync is an infrastructure/application boundary concern and must remain future/provider independent.
- Backup and sync must not create a second business-data authority.

## 18. Security boundary

Security-sensitive provider credentials/tokens belong behind explicit infrastructure/native boundaries.

Example principle:

```text
Application/domain
       ↓
secure-storage contract
       ↓
platform/provider adapter
```

The business layer must not know how a token is stored.

## 19. Testing boundary

Tests should verify contracts at the appropriate owner:

- Domain tests: business rules and deterministic calculations.
- Application tests: orchestration/workflow contracts.
- Repository tests: persistence contracts.
- Presentation tests: screen/form behavior against supplied state.
- Integration/CI: end-to-end wiring and production build integrity.

A calculation regression must be caught by deterministic calculation vectors rather than by a screenshot-only test.

## 20. Documentation authority

The authoritative human-readable contracts have distinct scopes:

1. `KFE_BUSINESS_RULES_REGISTER.md` — product scope and business meaning; sole business-rule authority.
2. `docs/KFE-ARCHITECTURE-CONTRACT.md` — architecture, layer ownership, data authority and implementation boundaries.
3. `docs/UI-UX-SHELL-CONTRACT.md` — presentation, shell, screen/component ownership, visual/interaction rules and UI/E2E verification.

When a concern crosses scopes, each contract governs its own responsibility: this architecture contract governs layer boundaries; the UI/UX & Shell Contract specializes presentation behavior and cannot override business/domain authority.


Historical audit/consolidation documents must not become current authority.

## 21. Change-control rule

Before adding a component, service, store, repository, provider, calculation or state authority, answer:

1. What responsibility does it own?
2. Who already owns that responsibility?
3. What is the authoritative data source?
4. Which layer owns it?
5. Is this duplicating an existing path?
6. Does it introduce provider lock-in?
7. Can it be replaced without changing business meaning?
8. What tests prove the boundary?

If an accepted/frozen rule is contradicted:

> 🔴 **DESIGN DRIFT / CONFLICT WARNING**

No silent drift.
