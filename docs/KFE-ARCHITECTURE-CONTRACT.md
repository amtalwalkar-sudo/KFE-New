# KFE Architecture Contract

**Status:** AUTHORITATIVE
**Purpose:** Single human-readable authority for KFE ownership, boundaries, data authority, replaceability and implementation constraints.

This document consolidates the accepted architectural principles from the Master Blueprint and architecture/data/ownership/field-level boundary work. It does not define business meaning or formulas. Business meaning belongs to `KFE_BUSINESS_RULES_REGISTER.md`; arithmetic/formula mechanics belong to `docs/KFE-CALCULATION-SPECIFICATION.md`.

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
Application
    ↓
Domain
    ↓
Repository Contracts
    ↓
Persistence / Infrastructure
    ↓
ONE AUTHORITATIVE LOCAL DATABASE
```

External providers sit behind infrastructure adapters.

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
| OCR/AI provider | Infrastructure |
| Cloud/backup provider | Infrastructure |
| Notifications | Infrastructure/native boundary |

No layer may silently assume ownership already assigned to another layer.

## 4. Calculation authority

- Business calculations exist in one authoritative domain calculation path.
- Presentation must consume calculated/read-model values rather than reproduce formulas.
- Application coordinates calculations but does not redefine business arithmetic.
- Provider adapters never calculate KFE business meaning.
- Machine-readable calculation metadata may exist for tooling, but it must agree with the human-readable calculation specification.

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
- Business/domain/application layers must not depend directly on a particular cloud/backup provider.
- Persistence is accessed through repository contracts.
- Backup/restore and sync operate against the authoritative persisted model rather than becoming alternate business-data authorities.
- Raw authoritative records remain recoverable.

## 7. Provider independence

The following are replaceable infrastructure concerns:

- OCR/AI provider
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

## 8. Ride capture boundary

Ride capture is an input pipeline, not a new business-data authority.

```text
Screenshot
   ↓
Multimodal extraction provider
   ↓
KFE validation
   ↓
Review/confirmation
   ↓
Authoritative ride record
```

The extraction provider may change without changing KFE business rules or the authoritative ride record contract.

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

Only these three documents are authoritative for this context:

1. `docs/KFE-BUSINESS-RULES.md` — what KFE means.
2. `docs/KFE-CALCULATION-SPECIFICATION.md` — how KFE calculates.
3. `docs/KFE-ARCHITECTURE-CONTRACT.md` — where/how KFE owns and implements it.

`spec/calculations/index.json` is a machine-readable calculation registry, not a competing human-readable specification.

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
