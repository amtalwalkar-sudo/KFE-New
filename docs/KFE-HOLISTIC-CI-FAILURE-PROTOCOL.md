# KFE Holistic CI Failure Protocol

## Purpose

When CI/build/test fails, determine the complete underlying system state before making corrections or rerunning CI. Do not optimize only for the currently reported error.

## Mandatory workflow

```text
CI failure
   ↓
Understand failure
   ↓
Trace dependency chain
   ↓
Inspect surrounding architecture
   ↓
Inspect related calculations / contracts / tests
   ↓
Find root cause(s) and secondary risks
   ↓
Correct underlying design/implementation
   ↓
Audit affected chain again
   ↓
Check stale tests/specs/docs
   ↓
Check duplicate authorities / regressions
   ↓
ONE verification CI run
```

## Mandatory rules

1. Do not immediately patch the failing line.
2. Do not assume the first reported failure is the only failure.
3. Do not weaken, delete, skip, disable, loosen, or bypass a test/contract merely to make CI pass.
4. Determine whether the failure is an implementation defect, architecture violation, incorrect calculation, incorrect authority/ownership, stale test, stale specification/documentation, incorrect fixture/test data, dependency/version issue, environment/configuration issue, missing coverage, hidden duplicate authority, period/unit/sign/timezone error, mutation/propagation problem, or a combination.
5. Inspect the dependency chain around the failure, not just the failing file.
6. Search for other implementations of the same concept/formula/behavior and identify duplicate or competing authorities.
7. Trace, adapting to the actual architecture as necessary:

```text
persisted inputs
↓
normalization
↓
domain/business logic
↓
application/services
↓
state
↓
UI/output
↓
tests/contracts
```

8. Audit relevant boundaries: persistence, normalization, domain/business logic, application/service layer, presentation/UI, external integrations, event propagation, caching/reactivity, configuration, tests/contracts, specifications/documentation.
9. For calculations explicitly audit authority, data lineage, units, period, sign, timezone, rounding/precision, ownership, historical/as-of behavior, and mutation propagation.
10. Check adjacent features, other periods, other data states, edge cases, historical/future data, empty/zero states, deleted/partial/multiple records, boundary dates, and configuration changes where relevant.
11. Inspect existing tests, contracts, fixtures, specifications, and documentation for semantic drift.
12. If the test is stale, correct it to the authoritative design. If implementation violates the authoritative design, correct implementation. Never change either merely to make the failure disappear.
13. After identifying fixes, perform a second holistic inspection of the affected dependency chain before rerunning CI.
14. Look specifically for regressions introduced by the fix.
15. Do not declare the system fixed merely because the originally failing test passes.

## Required pre-rerun audit report

### A. Failure
- What failed?
- What does the failure actually indicate?

### B. Root cause
- Direct cause
- Underlying cause
- Contributing causes

### C. Scope
- Other affected code/features/contracts

### D. Authority
- Intended owner
- Duplicate or competing authorities

### E. Boundary analysis
- Architectural boundaries involved
- Any layer bypassing the intended architecture

### F. Period/unit/data analysis
- Period, unit, sign, timezone, precision, and data-lineage findings

### G. Test/spec analysis
- Whether the failing test is correct or stale
- Related tests/specifications requiring attention

### H. Fix plan
- All related corrections together
- No piecemeal correction when issues share a root cause

### I. Regression audit
- Potential regressions
- Additional tests/contracts required

### J. Pre-rerun status

Use exactly one:

- 🟢 READY FOR CI
- 🟡 MORE INSPECTION REQUIRED
- 🔴 DESIGN / ARCHITECTURE CONFLICT
- 🔴 MULTIPLE RELATED DEFECTS FOUND

## Critical operating rule

Do not use:

```text
CI fails
→ fix one error
→ CI
→ fix next error
→ CI
```

Use:

```text
CI fails
→ holistic investigation
→ dependency/authority audit
→ identify all related issues
→ coordinated corrections
→ regression audit
→ ONE verification CI run
```

If CI exposes multiple failures, initially treat them as evidence of the same broader system state until proven otherwise, and group related failures by root cause rather than treating each as an independent ticket.

## Completion condition

The underlying system behavior must be consistent with the authoritative design, architecture, contracts, data model, and tests, with no known related defects left uninspected, before the verification CI is considered sufficient.
