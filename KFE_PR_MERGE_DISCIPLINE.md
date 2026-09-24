# KFE PR Merge Discipline

## Rule — one verified PR at a time

KFE development follows a sequential PR queue.

1. Do **not** create a new implementation PR while an older PR in the active queue is still open.
2. Finish the oldest active PR first: inspect checks, fix failures on that PR/branch, verify CI is **GREEN/SUCCESS**, then merge it.
3. After merge, rebase or recreate the next queued branch against the new `main` when required, verify CI again, and merge it before advancing.
4. Do not treat **pending**, skipped, or unknown checks as green.
5. Do not merge merely to clear the queue; the PR must be verified.
6. If a genuine blocker requires work, make that work on the existing PR/branch whenever possible rather than opening another PR.
7. Phase work advances only from the verified state of `main` after the preceding PR is merged.
8. CI/build success is not evidence of runtime/visual success; Phase 4 operational audit evidence remains separate.

## Current queue policy

The active queue must be reduced to zero before new Phase 4 implementation/audit PRs are opened.

As of 25 09 2026, the queue being worked through is:

- PR #98 — governance gate fix
- PR #99 — Phase 4 state/form/gate integrity audit
- PR #101 — BR-11 financial-model CI alignment

**Required order:** #98 → #99 → #101 → next Phase 4 step.

No additional PR should be opened ahead of these unless the existing PR itself must be changed and the change cannot be made on its branch.

## Verification standard

For every PR:

- confirm the exact head commit;
- inspect CI/check results;
- fix failures before merge;
- merge only after required checks are GREEN/SUCCESS;
- confirm the resulting `main` commit after merge;
- only then start the next queue item.

This is a repository workflow rule, not a product/business rule.
