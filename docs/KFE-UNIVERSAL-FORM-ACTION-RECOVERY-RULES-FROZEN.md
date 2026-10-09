# KFE Universal Form & Action Recovery Rules

**Status: FROZEN**  
**Scope: Entire KFE PWA**  
**Authority: Architectural invariant**

These rules govern every form, form-like interaction, gesture, committed action, and recovery workflow in KFE.

Domain-specific KFE rules may further define how recovery works for a particular record type, but they must not weaken, bypass, or contradict these rules.

Where a conflict exists, these Universal Rules are authoritative.

## 1. Cancel before commitment

Any form or pending action must have a safe way to abandon it without changing authoritative state.

```text
START
 ↓
EDIT / ENTER
 ↓
CANCEL
 ↓
NO AUTHORITATIVE CHANGE
```

Cancel means the operation did not happen. Close, back, and navigation must not silently commit the form. If there are unsaved changes, KFE may ask for confirmation. Temporary drafts may exist, but a draft is not authoritative data.

## 2. Save/commit is the point of no longer being a draft

A form becomes authoritative only through its intended commit operation.

```text
DRAFT
 ↓
VALIDATE
 ↓
COMMIT
 ↓
AUTHORITATIVE RECORD
```

UI controls must not bypass the authoritative application/business path.

## 3. Undo immediately after commitment

After a successful commit, KFE should offer Undo when the complete operation can still be safely reversed.

Undo must reverse the whole logical action, use the application/domain layer, not merely hide/delete a UI record, not bypass business rules, and not corrupt dependent records.

There must be no fake UI-only Undo.

## 4. Undo has a safety boundary

Undo is allowed only while reversing the action cannot invalidate subsequent authoritative operations. If later authoritative activity makes reversal unsafe, KFE moves to Correction.

## 5. Correction after downstream consequences

When an already-committed record has become part of subsequent authoritative history:

> Correct it; do not silently erase history.

```text
ORIGINAL RECORD
      ↓
CORRECTION
      ↓
CORRECTED AUTHORITATIVE STATE
```

Correction must preserve the necessary historical/audit information.

This applies especially to odometer, trips/rides, work sessions, fuel, revenue, maintenance, financial records, loan/EMI records, and compliance records.

## 6. Recovery must preserve business invariants

Cancel, Undo, and Correction must never bypass KFE's existing business rules. Recovery itself is an authoritative operation and must pass through the same application/business boundaries as normal operations.

No component should directly manipulate the database merely to implement Undo or Correction.

## 7. Navigation must never commit domain state

Navigation must not save a form, start/end a trip, change an odometer, create a financial record, discard committed data, or terminate an operational action accidentally. Navigation and domain commitment remain separate.

## 8. Mandatory parent-scoped draft recovery

Every rebuilt form must preserve uncommitted input across application restart. Drafts are temporary and non-authoritative.

Draft identity must include the form identity, workflow step, parent entity type, and canonical parent ID when one exists. Trip drafts must remain scoped to that Trip and its owning Shift; shift-closure drafts must remain scoped to that Shift.

A workflow that has not yet created a canonical parent must use a unique temporary workflow identity. It must not reuse a previous Trip or Shift's draft identity.

Restore a draft only when the active form and parent identity match. Failed validation or failed commitment preserves the draft. Remove it only after successful authoritative commitment or explicit confirmed discard. Navigation, restart, and parent changes must not silently commit or destroy it.

Drafts must use non-authoritative persistence separate from canonical business records and pending mutation recovery. Restoring a draft must never replay a committed mutation.

## 9. Destructive actions require stronger protection

Actions such as data reset, destructive deletion, irreversible cleanup, and destructive restoration must not behave like ordinary Save/Undo.

```text
REQUEST
 ↓
EXPLICIT CONFIRMATION
 ↓
COMMIT
 ↓
RECOVERY / RESTORE POLICY
```

The stronger the consequence, the stronger the confirmation/recovery requirement. Restore is not ordinary Undo.

## 10. Swipe actions follow the same contract

A swipe is another form/action mechanism. Before completion, there is no domain action. At completion, the action is committed, followed by Undo if safely reversible or Correction otherwise. A swipe never receives weaker safety rules because it is a gesture.

## 11. Errors never create ambiguous state

If a commit fails, the UI must not assume it committed or falsely display success. The application layer remains responsible for determining the authoritative outcome.

## 12. Domain recovery examples

### Odometer
Odometer entry remains editable before confirmation. If the delta requires allocation, Business and Personal KM are classified before commitment. Once an operation has started, its odometer becomes authoritative operational history. Later mistakes are corrected rather than silently deleted or rewritten. The continuous-odometer invariant remains mandatory.

### Trips / rides
Trip start may be immediately undone while no downstream operation depends on it. Trip end is a completion workflow: capture required completion details, then commit. Immediate safe mistakes may be undone; once downstream activity exists, use correction rather than rewriting history.

### Financial records
An immediate safe reversal may use Undo. Once a transaction participates in reports, allocations, settlements, or other downstream calculations, use correction/reversal and preserve the original event.

## 13. Universal design checklist

Every new driver-facing tab, form, button, swipe, or workflow must answer:

1. What can the driver accidentally do?
2. Can they cancel before commitment?
3. Can they undo immediately afterward?
4. When does Undo become unsafe?
5. What correction mechanism exists afterward?
6. Does recovery preserve authoritative history?
7. Can navigation ever accidentally change domain state?

## Governing principle

> **The easiest recovery should always be the safest recovery.**

## Authority rule

These Universal Form & Action Recovery Rules govern every form, form-like interaction, gesture, committed action, and recovery workflow in KFE.

Domain-specific rules may further define how recovery works for a particular record type, but they must not weaken, bypass, or contradict these rules.

Where a conflict exists, these Universal Rules are authoritative.

Any conflict with these rules is:

**🔴 DESIGN DRIFT / CONFLICT WARNING**
