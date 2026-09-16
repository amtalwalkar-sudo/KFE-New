# KFE — Extraction, Consolidation & Master Blueprint

**Status:** WORKING BLUEPRINT — NOT YET FROZEN  
**Purpose:** Governing framework for rebuilding KFE from a clean foundation.

---

# 1. PURPOSE

This document governs how historical KFE material is examined, extracted, consolidated, rejected, and organized during the clean rebuild.

The objective is to create **one new authoritative KFE architecture** without reproducing the duplication, conflicting ownership, parallel implementations, or architectural drift found in previous versions.

Historical repositories, branches, documents, specifications, and code are treated as:

> **SOURCE MATERIAL / EVIDENCE — NOT ARCHITECTURAL AUTHORITY**

The new KFE is being designed from a clean foundation.

---

# 2. FUNDAMENTAL RULE

## ONE RESPONSIBILITY → ONE OWNER → ONE AUTHORITATIVE SOURCE → ONE IMPLEMENTATION PATH

Every KFE responsibility must ultimately have:

- one owner
- one authoritative source
- one implementation path
- one contract where a contract is required

We do not create parallel implementations merely because an old version contains them.

---

# 3. EXTRACTION RULES

Every historical item must first be classified.

## A. VALID BUSINESS REQUIREMENT

A requirement representing what KFE actually needs to do.

**Action:** Extract and preserve.

## B. FROZEN BUSINESS RULE

A rule explicitly agreed for KFE.

**Action:** Extract and preserve as a rule.

## C. CALCULATION

A defined formula, financial rule, operational calculation, or derived value.

**Action:** Extract and preserve in the authoritative calculation/domain area.

## D. ARCHITECTURAL PRINCIPLE

A principle that remains valid for the new build.

**Action:** Extract the principle only. Do not automatically copy the old architecture.

## E. IMPLEMENTATION DETAIL

Something specific to old code, framework, provider, file structure, or implementation.

**Action:** Do not automatically carry forward. It must earn its place in the new blueprint.

## F. HISTORICAL PROPOSAL / EXPERIMENT

Something discussed but never accepted.

**Action:** Historical context only.

## G. SUPERSEDED DECISION

Something previously used but subsequently changed.

**Action:** Do not resurrect it.

## H. DUPLICATE MATERIAL

The same requirement, rule, calculation, architecture, or concept appearing in multiple branches or documents.

**Action:** Consolidate into one authoritative concept.

Never create multiple copies in the new blueprint simply because multiple historical copies existed.

## I. CONFLICT

Two historical sources disagree.

**Action:** Do not silently choose one.

Mark:

> 🔴 DESIGN DRIFT / CONFLICT WARNING

Then resolve against the latest explicitly approved KFE decision.

If the conflict cannot be resolved from existing decisions, it becomes an open design question.

---

# 4. HISTORICAL PRIORITY RULE

When historical material conflicts, we do not decide based on:

- which file is longer
- which branch contains more code
- which implementation came later automatically
- which architecture looks technically attractive
- which document has "final" in its filename

Priority is based on:

1. Explicit KFE decisions
2. Explicitly frozen KFE decisions
3. Validated business requirements
4. Validated business rules
5. Validated calculations
6. Explicitly approved architectural principles

If a conflict cannot be resolved from existing decisions, it remains an:

> **OPEN DESIGN QUESTION**

It must not become an assumption disguised as architecture.

---

# 5. NO DOCUMENT COPYING RULE

We are not building the new KFE by copying old documents into new folders.

Instead:

```text
OLD MATERIAL
     ↓
IDENTIFY
     ↓
CLASSIFY
     ↓
EXTRACT KNOWLEDGE
     ↓
VALIDATE
     ↓
RESOLVE CONFLICTS
     ↓
REMOVE DUPLICATES
     ↓
ASSIGN OWNERSHIP
     ↓
PLACE INTO BLUEPRINT
```

Old material supplies evidence. The new blueprint contains the consolidated knowledge that has been validated for the new KFE.

---

# 6. NO DUPLICATE ARCHITECTURE RULE

The new KFE must explicitly reject:

- multiple shells
- multiple databases
- multiple stores for the same authority
- duplicate repositories
- duplicate calculation engines
- duplicate form systems
- duplicate state authorities
- UI-owned business rules
- provider-specific domain logic
- parallel persistence paths
- hidden fallback implementations
- competing synchronization mechanisms
- competing backup mechanisms
- duplicate screen ownership
- duplicate validation ownership

If something already has an owner:

> **DO NOT CREATE ANOTHER OWNER FOR IT.**

---

# 7. BLUEPRINT-FIRST RULE

Before implementation, we establish the KFE Master Blueprint.

Every subsequent item must answer:

> **WHERE DOES THIS BELONG IN THE BLUEPRINT?**

If it does not fit, stop and determine why.

It may be:

1. A missing requirement
2. An incorrectly classified item
3. An implementation detail
4. Obsolete historical material
5. A genuine new architectural concern
6. Duplication of an existing responsibility

We do not simply create another folder, layer, service, database, component, store, or system to make something fit.

---

# 8. BLUEPRINT WE ARE VISUALISING

At the highest level, KFE is being visualised as a clean system with clearly separated responsibilities:

```text
                         KFE
                          │
             ┌────────────┴────────────┐
             │                         │
        PRESENTATION                 DOMAIN
             │                         │
       UI / Screens              Entities
       Shell / Layouts            Rules
       Forms                      Calculations
       Presentation State         Invariants
             │                         │
             └────────────┬────────────┘
                          │
                     APPLICATION
                          │
                    Use Cases
                    Workflows
                    Actions
                          │
                          │
                    PERSISTENCE
                          │
              Repository Boundary
                          │
                ONE AUTHORITATIVE DB
                          │
             ┌────────────┴────────────┐
             │                         │
        Backup / Restore             Sync
             │                         │
             └────────────┬────────────┘
                          │
                    INFRASTRUCTURE
                          │
          ┌───────────────┼───────────────┐
          │               │               │
       Capacitor       OCR / AI       Cloud Providers
       Android        Provider        External Services
          │                               │
     Notifications                    Network/etc.
```

**Important:** This is the current working visualisation. It is **not yet frozen**. Ownership and boundaries must be validated before the architecture is frozen.

---

# 9. OWNERSHIP PRINCIPLE

The blueprint must eventually answer one question for every responsibility:

> **WHO OWNS THIS?**

Initial ownership model for validation:

| Responsibility | Intended Owner |
|---|---|
| Business entities | Domain |
| Business rules | Domain |
| Calculations | Domain |
| Invariants | Domain |
| Use cases | Application |
| Workflows | Application |
| Persistent data | One authoritative database |
| Database access | Persistence |
| Repository contracts | Persistence / Application boundary |
| UI state | Presentation |
| Screens | Presentation / UI |
| Forms | One authoritative form system |
| Shell | One authoritative shell |
| Layout | One authoritative layout system |
| Backup / Restore | Persistence + Infrastructure boundary |
| Sync | Persistence + Infrastructure boundary |
| Android / Native capability | Capacitor boundary |
| OCR / AI provider | Infrastructure |
| External cloud provider | Infrastructure |
| Notifications | Infrastructure / Native boundary |

This is a **working ownership proposal** until reviewed and frozen.

---

# 10. PROVIDER INDEPENDENCE RULE

Providers must never become the owner of KFE business meaning.

The intended relationship is:

```text
KFE DOMAIN
    ↓
KFE APPLICATION
    ↓
KFE CONTRACTS
    ↓
INFRASTRUCTURE ADAPTER
    ↓
PROVIDER
```

Not:

```text
KFE BUSINESS LOGIC
        ↓
    SUPABASE
```

And not:

```text
KFE RIDE LOGIC
        ↓
     GOOGLE AI
```

Therefore:

- OCR providers can change.
- Cloud providers can change.
- Backup providers can change.
- Sync providers can change.
- Native implementations can evolve.
- External services can change.

KFE's business/domain/application meaning must remain intact.

---

# 11. DATA AUTHORITY RULE

Every important piece of information must have one authoritative source.

For example:

```text
Ride Record
    ↓
ONE AUTHORITATIVE RIDE RECORD
```

Not:

```text
UI Ride
Store Ride
OCR Ride
Temporary Ride
Database Ride
ERP Ride
```

Different processing states, projections, or views may exist, but they must not become competing authorities for the same business fact.

Derived values should be reconstructable from authoritative persisted state.

---

# 12. EXTRACTION → CONSOLIDATION → BLUEPRINT FLOW

Every historical item follows this path:

```text
Historical Material
        ↓
Identify
        ↓
Classify
        ↓
Extract
        ↓
Validate
        ↓
Resolve Conflicts
        ↓
Remove Duplicates
        ↓
Assign Ownership
        ↓
Place in Blueprint
        ↓
Mark Status
```

Possible statuses:

- Existing validated
- Frozen
- Accepted but not frozen
- Proposal
- Open question
- Conflict
- Rejected
- Historical only
- Missing / needs design

---

# 13. REJECTED / DO NOT RECREATE

The new blueprint explicitly rejects patterns that caused the previous architectural mess.

```text
REJECTED / DO NOT RECREATE

✗ Multiple shells
✗ Multiple databases
✗ Multiple stores for the same authority
✗ Duplicate repositories
✗ Duplicate calculation engines
✗ Duplicate form systems
✗ Duplicate state authorities
✗ UI business logic
✗ Provider-specific domain logic
✗ Parallel persistence paths
✗ Hidden fallback implementations
✗ Duplicate sync mechanisms
✗ Duplicate backup mechanisms
✗ Architecture copied from historical branches
✗ "Temporary" second implementations that become permanent
✗ v1 / v2 / final parallel architectures
✗ Multiple competing sources of truth
✗ Feature-specific parallel architectures
```

---

# 14. ORGANIZATION RULE

Once the blueprint exists, everything we do gets organized underneath it.

Future work such as:

- Ride Capture
- OCR
- Work
- Shift
- Trips
- Revenue
- Expenses
- Vehicle
- Timeline
- Backup
- Restore
- Sync
- Notifications
- Forms
- Calculations
- Testing
- Capacitor
- Cloud providers

must be mapped into the blueprint.

We do not create an independent architecture for each feature.

The feature does not get to invent its own architecture.

Conceptually:

```text
KFE MASTER BLUEPRINT
        │
        ├── Ride Capture
        │     ├── Domain
        │     ├── Application
        │     ├── Presentation
        │     └── Infrastructure
        │
        ├── Work
        │
        ├── Finance
        │
        ├── Vehicle
        │
        ├── Backup
        │
        └── Sync
```

This is an organizational visualisation. It does not mean each feature gets its own duplicated layers or implementations.

---

# 15. CHANGE RULE

If future work appears to require something that is not represented in the blueprint, we do not immediately implement it.

First determine:

> Is this a missing requirement, a missing responsibility, a new architectural concern, or duplication of something that already exists?

Only then can the blueprint change.

If that change conflicts with an already accepted or frozen decision:

> 🔴 **DESIGN DRIFT / CONFLICT WARNING**

No silent architectural drift is permitted.

---

# 16. FREEZE RULE

The blueprint is initially a **working visualisation**.

It is not automatically frozen.

The intended progression is:

```text
WORKING
   ↓
REVIEWED
   ↓
COMPLETE ENOUGH
   ↓
FREEZE READY
   ↓
USER APPROVAL
   ↓
FROZEN
```

Nothing becomes frozen merely because it has been written down.

Explicit user approval is required before a major architectural decision is treated as frozen.

---

# 17. REBUILD PRINCIPLE

We are not organising the old KFE.

We are extracting useful knowledge from the old KFE and using it to construct one clean, authoritative KFE.

Historical material is therefore:

> **SOURCE MATERIAL — NOT ARCHITECTURAL AUTHORITY**

The new architecture must be derived deliberately from:

- validated requirements
- validated rules
- approved calculations
- explicit decisions
- validated ownership
- validated boundaries

---

# 18. GOVERNING DATA / RECOVERY PRINCIPLE

KFE must be recoverable by reconstruction from authoritative persisted state.

This means the architecture must avoid hidden state that becomes necessary for recovery.

Where a value can be deterministically reconstructed from authoritative persisted information, the reconstruction path must remain available.

This principle applies to:

- application state
- calculations
- timelines
- derived financial values
- backup consistency
- restore
- synchronization
- recovery after process death
- provider failure

---

# 19. IMPLEMENTATION GATE

No production implementation begins merely because historical code already exists.

Before creating an implementation component, answer:

1. What responsibility does this component own?
2. Who currently owns that responsibility?
3. Is another component already doing it?
4. What is the authoritative source of its data?
5. Which blueprint layer owns it?
6. Is the boundary defined?
7. Is the decision accepted or still a proposal?
8. Would this create a duplicate path?
9. Would this introduce provider lock-in?
10. Can the component be removed/replaced without changing KFE business meaning?

If these answers are unclear, the design is not implementation-ready.

---

# 20. HISTORICAL MATERIAL BOUNDARY

The historical collection may contain:

- old repositories
- old branches
- old specifications
- old architecture documents
- old implementation notes
- old experiments
- old UI designs
- old database designs
- old provider decisions

These materials remain useful as evidence.

They must not be treated as active KFE specifications unless their relevant content has been explicitly extracted, validated, and placed into the new blueprint.

Historical files must never silently become implementation authority.

---

# 21. MASTER GOVERNING PRINCIPLE

Every future:

- decision
- document
- component
- database table
- service
- calculation
- form
- screen
- provider adapter
- repository
- state owner
- backup mechanism
- synchronization mechanism
- implementation

must have a clearly identifiable place and owner in the Master Blueprint.

The governing rule is:

> **ONE RESPONSIBILITY → ONE OWNER → ONE AUTHORITATIVE SOURCE → ONE IMPLEMENTATION PATH**

Anything that cannot satisfy this rule must be reviewed before implementation.

---

# 22. CURRENT STATE

**Blueprint Status:** WORKING

**Architecture Status:** NOT FROZEN

**Historical Material Status:** REFERENCE / EVIDENCE ONLY

**Implementation Status:** NOT YET STARTED

**Git Commit Status:** NOT YET COMMITTED

**Next Activity:** Historical extraction and consolidation against this blueprint.

---

# 23. NEXT WORKING RULE

From this point forward, all extraction, analysis, design, and implementation planning must be organized against this document.

We do not allow the historical repository to determine the shape of the new KFE.

The blueprint determines the organization.

Historical material supplies evidence.

Explicit KFE decisions determine what is accepted.

User approval determines what becomes frozen.

Implementation follows only after ownership and boundaries are sufficiently defined.

---

# 24. OBSOLETE IMPLEMENTATION CLEANUP RULE

Once KFE has a validated replacement for an obsolete implementation, the old implementation must not remain alongside it merely for convenience or historical compatibility.

## REPLACE AND DELETE — SAME RUN

When obsolete code, architecture, configuration, or references are identified:

```text
IDENTIFY OLD IMPLEMENTATION
        ↓
CHECK REFERENCES / DEPENDENCIES
        ↓
VERIFY CURRENT REPLACEMENT
        ↓
WIRE CURRENT IMPLEMENTATION
        ↓
DELETE OBSOLETE IMPLEMENTATION
        ↓
DELETE OBSOLETE REFERENCES
        ↓
SEARCH AGAIN FOR STALE REFERENCES
        ↓
RUN RELEVANT TESTS / BUILD
```

The rule is:

> **Do not merely replace obsolete KFE code. Replace it AND delete the obsolete implementation/references in the same run.**

This applies to, among other things:

- old service workers
- duplicate PWA shells
- obsolete shell/layout implementations
- abandoned routes and screens
- duplicate components
- old repositories and adapters
- obsolete calculation engines or calculation paths
- legacy storage paths
- stale configuration
- old backup implementations
- obsolete sync implementations
- old provider-specific paths
- obsolete Cordova/PWA architecture
- dead compatibility code
- stale documentation/configuration references when they describe the removed implementation as active

## SAFETY RULE

Deletion is not blind deletion.

Before deleting an obsolete item, KFE must first establish that:

1. The item is actually obsolete.
2. Its current references have been identified.
3. Any required responsibility has a valid current owner.
4. The replacement is wired into the authoritative path.
5. Deleting the old item will not remove a still-required capability.

If those conditions are not established, deletion becomes an investigation item rather than an assumption.

## NO PARALLEL LEGACY PATHS

After replacement and cleanup, the repository should not retain an old implementation as a hidden fallback, second source of truth, duplicate provider adapter, or parallel architecture unless that compatibility path has been explicitly approved as a current requirement.

A temporary migration path must have a defined owner, purpose, and removal condition. It must not silently become permanent.

## VERIFICATION REQUIREMENT

Every obsolete-code cleanup should end with a repository-wide stale-reference check and the relevant tests/build/CI verification.

A successful replacement is therefore not:

> **new implementation exists**

It is:

> **new implementation exists + old implementation deleted + stale references deleted + wiring verified + tests/build verified**

If a cleanup reveals a conflict with an accepted or frozen KFE rule, stop and mark:

> 🔴 **DESIGN DRIFT / CONFLICT WARNING**

Do not preserve obsolete architecture merely because deleting it exposes a historical dependency. Resolve the dependency against the current KFE blueprint and authoritative decision.

---

# 25. CHANGE ISOLATION / BOUNDED IMPACT RULE

KFE must be designed so that a change in one responsibility has the smallest reasonable and explicitly controlled impact on other responsibilities.

The objective is not to eliminate every dependency. A clean system still has necessary dependencies. The objective is to ensure that dependencies cross **explicit contracts**, not implementation internals.

The governing principle is:

> **CHANGE ONE THING → ONLY ITS DEFINED DEPENDENTS SHOULD NEED TO CHANGE**

A UI/UX change must not silently alter calculations, database rules, backup behavior, OCR behavior, or business meaning.

A calculation change must not require rewriting the shell, storage engine, OCR provider, or Android integration merely because those parts are coupled to its implementation details.

A provider change must not require changing KFE business/domain meaning.

## 25.1 DEPENDENCY DIRECTION

The intended dependency direction is:

```text
UI / UX / Presentation
          ↓
Application / Use Cases
          ↓
Domain / Business Rules / Calculations
          ↓
Persistence Contracts
          ↓
Persistence Implementation
          ↓
Infrastructure Adapters
          ↓
External Providers / Platform
```

Supporting infrastructure may also implement explicit contracts for:

```text
OCR / AI
Backup / Restore
Sync
Notifications
Capacitor / Android
Network
Cloud providers
```

These providers must not become dependencies of the business/domain layer merely because they are currently used by KFE.

## 25.2 HARD BOUNDARIES

The following boundaries must be protected:

- Presentation must not own business calculations.
- Presentation must not directly access database internals.
- Presentation must not import provider-specific infrastructure when an application/contract boundary exists.
- Domain must not import UI, Vue, browser presentation code, Capacitor, Dropbox, OCR providers, or other external provider implementations.
- Calculations must not depend on UI state, screen components, browser rendering, or provider SDKs.
- Application use cases may coordinate domain and contracts, but must not become a second calculation engine.
- Repositories persist and retrieve authoritative data; they must not silently become the owner of business calculations.
- Infrastructure adapters translate external/provider behavior into KFE contracts; provider-specific types must not leak into domain meaning.
- The shell starts and hosts the application; it must not become a hidden business-logic owner.
- Backup/restore and sync must operate through authoritative persistence/contracts rather than maintaining a competing business-data authority.

## 25.3 STATE OWNERSHIP

Every important state value must have one owner.

```text
AUTHORITATIVE BUSINESS DATA
        ↓
PERSISTED AUTHORITY

DERIVED BUSINESS VALUES
        ↓
DOMAIN / CALCULATION AUTHORITY

WORKFLOW STATE
        ↓
APPLICATION

SCREEN / FORM / INTERACTION STATE
        ↓
PRESENTATION
```

Temporary UI state may exist, but it must not silently become persistent business authority.

Derived values must not be independently edited or persisted as competing facts unless explicitly required by the business design.

## 25.4 CONTRACT-FIRST REPLACEABILITY

Where a responsibility is expected to be replaceable, consumers depend on a stable KFE contract rather than the concrete implementation.

Examples include:

- repository implementations
- backup providers
- sync providers
- OCR/AI providers
- native notification implementations
- external cloud providers

Replacing one implementation should therefore follow:

```text
KEEP KFE CONTRACT
        ↓
REPLACE ADAPTER / IMPLEMENTATION
        ↓
VERIFY WIRING
        ↓
RUN CONTRACT TESTS
        ↓
DELETE OLD IMPLEMENTATION
```

The contract is the stable seam; the provider implementation is replaceable.

## 25.5 SINGLE AUTHORITATIVE CALCULATION PATH

Every business calculation must have one authoritative calculation owner.

UI formatting, dashboards, reports, exports, and notifications may consume calculated results, but must not independently recreate the same business formula.

Examples include:

- revenue
- total vehicle KM
- ride KM
- dead KM
- fuel consumption/cost
- maintenance
- loan/EMI
- renewals
- targets
- break-even
- profitability
- shift/timeline derivations

If two paths calculate the same business fact differently, this is a potential architectural defect and must be investigated rather than accepted as normal duplication.

## 25.6 SINGLE AUTHORITATIVE SHELL

KFE must have one active application shell and one authoritative shell startup path.

The shell may provide:

- application bootstrap
- routing host
- global layout
- global error boundary
- registration of platform services
- presentation-level providers

It must not become a second application architecture or contain hidden business workflows.

Old shells, duplicate shells, stale service-worker assumptions, abandoned route trees, and compatibility shells are subject to the **REPLACE AND DELETE — SAME RUN** rule.

## 25.7 FORM ISOLATION

Forms are presentation mechanisms for collecting authoritative inputs.

A form may perform presentation validation such as required fields, formatting, and user feedback, but business validation and calculations must remain owned by the appropriate domain/application layer.

Changing a field layout, label, component, or UX interaction must not change the underlying business rule unless the explicitly defined contract itself changes.

## 25.8 REGRESSION GUARDRAILS

The repository must protect the boundaries with automated checks wherever practical.

At minimum, guardrails should detect:

1. Domain importing presentation code.
2. Domain importing provider/platform implementations.
3. Calculation modules importing UI or persistence internals.
4. Presentation importing database/provider internals directly.
5. Duplicate calculation authorities.
6. Duplicate active shells.
7. Duplicate persistence authorities.
8. Stale service-worker or obsolete architecture references.
9. Provider-specific types leaking into domain/application contracts.
10. Business calculations embedded in forms or screens.

These checks should be treated as architecture/integrity tests, not optional style checks.

## 25.9 BOUNDED-CHANGE TEST

For any material change, ask:

> **What is the intended blast radius of this change?**

Then verify that files outside that boundary do not change merely because of hidden coupling.

Examples:

| Change | Should primarily affect | Should NOT require implementation changes in |
|---|---|---|
| UI styling/layout | Presentation | Domain, calculations, persistence, providers |
| Form component change | Presentation | Calculation engine, DB adapter, OCR provider |
| Calculation rule change | Domain/calculation + defined consumers | Shell internals, provider SDKs |
| Database implementation change | Persistence/adapter | Domain business meaning, UI internals |
| OCR provider change | OCR adapter/integration | Ride business rules, shell, calculations |
| Backup provider change | Backup adapter | Domain meaning, forms, calculation engine |
| Android/native implementation change | Capacitor/native boundary | Domain calculations, business rules |

This table describes the intended architecture, not a promise that no legitimate dependent code can ever change. If a legitimate dependency is discovered, it must be explicit and owned.

## 25.10 NO MAGIC CROSS-LAYER ACCESS

Convenience imports, global mutable objects, direct database calls, provider SDK calls, or hidden singleton state must not be used to bypass an established boundary.

If a cross-layer dependency is genuinely required, it must be exposed through an explicit contract and assigned to the correct owner.

## 25.11 CHANGE-ISOLATION REVIEW GATE

Before accepting a significant architectural or implementation change, verify:

1. Responsibility owner is identified.
2. Authoritative data source is identified.
3. Dependency direction remains valid.
4. Public contract is stable or deliberately versioned.
5. No second source of truth was introduced.
6. No duplicate calculation path was introduced.
7. No UI-to-infrastructure shortcut was introduced.
8. No provider-specific business dependency was introduced.
9. Obsolete implementation was removed if replaced.
10. Relevant contract/integrity tests pass.

If any item fails because an accepted or frozen decision would need to change, mark:

> 🔴 **DESIGN DRIFT / CONFLICT WARNING**

Do not silently weaken an existing boundary to make an implementation easier.

---

# FINAL PRINCIPLE

> **We are not cleaning up the old KFE.**
>
> **We are using the old KFE as evidence to build a new, clean KFE.**
>
> **No duplicates. No competing authorities. No silent drift. One responsibility, one owner, one authoritative source, one implementation path.**
>
> **When an implementation is obsolete, replace it and delete it in the same run. Do not leave the old path behind.**
>
> **When a responsibility changes, its impact must remain bounded by explicit contracts and ownership boundaries. UI/UX, shell, application, domain/calculations, persistence, backup/sync, OCR, and native/platform concerns must remain replaceable without hidden coupling.**
