# Native Work Command Contract — Design Gate

**Status:** Proposed implementation contract; supporting design, not a replacement for the authoritative lifecycle/data/business contracts.  
**Purpose:** Define the boundary that must exist before adding native shift start/end, while preserving the existing durable native recovery guarantees.  
**Scope:** PWA Work commands, Android overlay commands, native canonical SQLite, PWA IndexedDB projection/reconciliation.

## Governing authorities

- `docs/KFE-ARCHITECTURE-CONTRACT.md`: one responsibility, one owner, one authoritative source, one implementation path.
- `docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md`: canonical operational lifecycle and transition semantics.
- `docs/KFE-CANONICAL-DATA-CONTRACT.md`: persisted entity and field authority.
- `KFE_BUSINESS_RULES_REGISTER.md` and `docs/KFE-CALCULATION-SPECIFICATION.md`: business meaning and calculation mechanics.
- `docs/requirements/NATIVE_OVERLAY_FULL_SHIFT_WORKFLOW.md`: overlay must execute an entire shift with the PWA closed.
- Financial decision for this audit: `Shift.revenue` is derived from eligible completed-trip fares plus cancellation fees; blank/not-applicable cancellation fee is ₹0.

This document cannot override those authorities. If an implementation conflict is found, stop and update the proper authority before proceeding.

## 1. Confirmed baseline

The current Android overlay can durably commit trip lifecycle actions and fare/cancellation forms to native canonical SQLite, using the native outbox/checkpoint and idempotent operation store. The PWA catches up its IndexedDB representation when available.

The current adapter `src/infrastructure/android/kfeOverlay.js` exposes visibility/permission and form callbacks, but not shift-start or shift-end commands. The current lifecycle adapter also suppresses the overlay when no active shift exists. Consequently, native-only full-shift operation is not implemented yet.

Existing guarantees are invariants, not implementation details to remove:
- Native canonical writes, operation outcomes and audit rows remain transactional.
- Every retried logical action reuses a stable event/operation identity.
- Reusing an operation ID with a different command, entity or payload is rejected.
- Stale/conflicting writes fail closed.
- Durable outbox/checkpoint evidence survives a failed canonical write and is retried without duplicate side effects.
- A UI animation, optimistic state, queued-but-uncommitted command or PWA acknowledgement is not proof of canonical commit.

## 2. Command envelope

Every user-initiated operational mutation from either surface must be represented as a validated command envelope. The transport may differ; its meaning must not.

Required fields:
- `commandId`: stable ID for this logical user intent; reused on retry.
- `commandType`: a lifecycle command from the canonical allow-list.
- `entityId`: existing canonical Shift or Trip ID when applicable; shift creation uses a stable proposed Shift ID.
- `expectedRevision`: expected canonical revision/version when available; a stale command must be rejected, not silently merged.
- `occurredAt`: event time captured once and retained across retries.
- `payload`: typed inputs only; no UI component state, formatted labels, or derived totals.
- `origin`: diagnostic metadata such as PWA or Android overlay; origin must not alter business semantics.

The executor returns a structured outcome:
- `ACCEPTED`: canonical transaction committed; includes authoritative resulting record(s), revision and command ID.
- `REJECTED`: a domain/precondition conflict; includes stable reason code and leaves no partial canonical mutation.
- `RETRYABLE_FAILURE`: persistence/capability failure; durable pending evidence remains recoverable where the command has been journaled.
- `ALREADY_APPLIED`: same command ID and same payload already committed; returns the original canonical outcome without repeating effects.

The UI may show success only for `ACCEPTED` or `ALREADY_APPLIED`. Transport success alone is not a command outcome.

## 3. Initial command inventory

The contract must cover the whole lifecycle, not only the two missing shift operations:

| Command | Canonical target | Required invariant |
|---|---|---|
| `SHIFT_START` | Create one active Shift | Validate odometer and previous-odometer gap; require governed allocation/acknowledgement before activation |
| `GO_TO_PICKUP` | Existing Shift + Trip | Only from a lifecycle state that permits a pickup; one Trip identity per accepted command |
| `START_TRIP` | Existing Trip | Trip must be in pickup/ready state; reject invalid or duplicate transition |
| `END_TRIP` | Existing Trip | Trip must be active; completion remains recoverable pending optional fare detail |
| `CANCEL_TRIP` | Existing Trip | Only while in pickup/ready state; same Trip becomes cancelled; blank cancellation fee stores ₹0 |
| `SAVE_FARE` / `SKIP_FARE` | Existing completed Trip | Preserve canonical Trip fields; optional fare detail cannot be fabricated or duplicated |
| `END_SHIFT` | Existing active Shift | Validate closure eligibility and end odometer; derive revenue and reconciliation from canonical records; atomically close once |

Command names are contract labels, not a requirement to rename all current persisted event types in one change. An adapter may map existing event names to these semantics if mapping is explicit and tested.

## 4. Authority and execution boundaries

### Application command boundary
- Owns command normalization, use-case orchestration, lifecycle preconditions and structured outcomes.
- Invokes the authoritative domain rules and repository contract.
- Must not be implemented separately in each form, button, PWA view or overlay control.

### Canonical persistence executor
- Owns durable canonical mutation and operation outcome.
- Must commit the business record, operation identity/outcome and audit evidence in one transaction where supported.
- Must validate expected revision/state inside the commit boundary, not only in the UI.
- Must not treat PWA IndexedDB as a second authority for operations committed while the PWA is closed.

### Native capability adapter
- Exposes typed commands and authoritative outcomes to the overlay when the WebView is absent.
- Owns Android-only capabilities (foreground service, SQLite access, background lifecycle, native GPS integration), not alternate business meaning.
- Must not receive a UI snapshot and blindly write it over canonical records.
- Must not require the PWA to process or acknowledge a command before the shift can continue.

### PWA adapter and projection
- Calls the same command semantics when the PWA is running.
- On resume, reads/reconciles authoritative native canonical records and updates IndexedDB as a projection/read model.
- Catch-up is idempotent; it must not replay a committed command as a second business mutation.
- A stale PWA snapshot must never overwrite newer native canonical fields.

### Presentation
- Forms and buttons collect typed inputs and display command outcomes.
- Presentation components must not own formulas, canonical writes, operation IDs or independent lifecycle rules.
- Extracted form/keypad/metrics components remain replaceable shells over the same application command contract.

## 5. Shift start and end requirements

### Shift start
The command must carry the odometer input and any explicit gap allocation/acknowledgement. The authoritative path must:
1. load the previous applicable odometer boundary;
2. validate the entered odometer and compute the gap using the existing domain rule;
3. require valid Personal KM / Dead KM allocation where required;
4. commit the Shift, gap/allocation evidence, command outcome and audit evidence atomically or through an explicitly recoverable transaction protocol;
5. return the canonical active Shift only after commit.

No active Shift may be inferred from an overlay preference or local draft.

### Shift end
The command must carry end odometer and required closure inputs. The authoritative path must:
1. confirm the Shift is active and closure is permitted;
2. validate end odometer against start odometer and existing gap rules;
3. load eligible canonical Trips and derive revenue through the accepted shared rule;
4. reconcile against the canonical Trip set, including cancellation fees (blank/not-applicable = ₹0);
5. commit end boundary, reconciliation and terminal Shift state once;
6. return the canonical closed Shift only after commit.

A stale overlay cannot mutate a Shift after closure. A retry returns the same closure result rather than closing twice.

## 6. Revenue contract

`Shift.revenue` is not a form-owned input or a sum maintained independently by each surface. It is derived from eligible completed-trip fares plus cancellation fees under the accepted financial decision. For cancelled trips, explicit blank/null/not-applicable cancellation fee contributes ₹0 and must not fall back to a previous trip fare. Soft-deleted/ineligible trips are excluded as required by the domain rule.

Native and PWA projection values must converge to the same result from the same canonical Trip records. The implementation must reuse the existing authoritative derivation or extract a single shared implementation; a second JavaScript/Java formula is not acceptable without an explicitly approved architecture decision and parity proof.

## 7. Failure and replay protocol

For every command, test these cases:
- same command ID + same payload before commit: resume/retry without duplicate effects;
- same command ID + same payload after commit but before acknowledgement: return original outcome;
- same command ID + different payload: reject;
- canonical transaction fails after durable queue append: preserve pending evidence and retry safely;
- stale expected revision or ended Shift: reject without changing canonical records;
- process/WebView closes at every durable boundary: reconstruct and continue;
- PWA opens with stale IndexedDB: replace/reconcile projection from canonical state without regression;
- repeated end-shift request: one terminal Shift, one reconciliation outcome, no duplicate financial side effects.

No new recovery mechanism may bypass or replace the existing native checkpoint/outbox/operation guarantees. Extend the current mechanism where possible.

## 8. Required implementation gates

Before production changes:
1. Map existing PWA start/end use cases and domain validators to this envelope; identify the exact existing calculation/validation owner for odometer gaps, Personal KM/Dead KM allocation, shift reconciliation and closure.
2. Map native canonical SQLite records and PWA IndexedDB records field-by-field; explicitly classify SQLite authority versus PWA projection and identify any field conflict.
3. Specify the durable journal/transaction order for shift start and shift end, including recovery after process death between each step.
4. Add contract tests for normalization, command identity, structured outcomes and stale-state rejection.
5. Only then implement the smallest native capability adapter and wire PWA/overlay through the same command semantics.

Acceptance test required after implementation: start a shift, perform multiple trips including fare and cancellation, end the shift and reconcile while the PWA remains fully closed; then open the PWA and verify the exact Shift/Trip state, odometer/gap allocation, revenue and reconciliation with no duplicate records. CI is software evidence only; background, screen-off, reboot and offline validation also require physical-device testing.

## 9. Explicit non-goals for the first implementation

- No broad recovery rewrite.
- No UI redesign bundled into lifecycle ownership changes.
- No parallel business database or alternate Trip/Shift history.
- No direct native UI writes that bypass the command executor.
- No weakening of GPS/Valhalla, background/restart, km-gap, or state-specific timer requirements.
- No claim of full-shift readiness until the PWA-closed end-to-end acceptance scenario passes.
