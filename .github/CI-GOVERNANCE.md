# KFE 2.0 CI Governance — Frozen

## Purpose

KFE uses one canonical CI workflow: **KFE 2.0 single CI**.

- Pull requests run the complete canonical validation path without deployment.
- Pushes to `main` run the complete validation and production-publish path.
- A manual dispatch can run the complete validation path without deployment.
- There is no separate incremental workflow and no duplicate certification workflow. All required validation belongs to the canonical workflow.

## Non-negotiable rule

Targeted fast checks may reduce unnecessary upstream work only when the changed paths are classified safely. They must never weaken the downstream checks required for the affected boundary. A previous green result is never reused as proof for changed code.

If a change cannot be safely classified, the canonical CI must use the complete validation path.

## Domain-scoped implementation principle

CI scope and implementation scope are separate concerns. A failing validation in an unrelated domain does not authorize changing that unrelated domain. Fix the actual contract, test, or implementation defect responsible for the failure.

## Engineering speed principle

KFE must be developed as quickly as technically possible **without weakening correctness, data integrity, architecture, testing, CI, or deployment verification**.

CI efficiency means removing duplicate validation, not removing required evidence. The canonical single CI is the only CI path that should be extended when new mandatory validation is introduced.

## Universal domain rule

Every KFE domain follows the same lifecycle:

`Audit → Clean replacement → Domain contract → Persistence contract → Application/UI contract → Integration → CI → Full CI at freeze → Freeze`

Once a domain is frozen, later domain work must not silently alter its frozen contract. If a change crosses a frozen boundary, the affected boundary and all downstream checks run again.

## Boundary order

The current master validation chain is ordered as:

`foundation → governance → architecture → domain/lifecycle → work/geolocation → administrator → persistence/recovery → UI shell → application boundaries → real persistence → runtime syntax/domain → runtime identity/service-worker → browser integration → resilience/offline → final state sync → final build`

This order is the canonical dependency direction for future modules.

## Change classification

Classify changes using repository paths, not commit-message guesses.

- `.github/**`, `package.json`, lockfiles, build/config files, `index.html`, service worker, shared infrastructure, shared domain/application utilities, or unknown paths → complete CI.
- Module domain/application/repository/UI/test changes → start at the earliest affected boundary and run all required downstream checks available in the canonical CI.
- Pure test-contract changes are still validated from the boundary they describe; they do not justify skipping the implementation boundary.

## Full CI remains mandatory

Run the complete canonical CI path:

- before declaring a domain frozen,
- after shared infrastructure or architecture changes,
- after CI governance changes,
- when change classification is uncertain,
- and for final release/deployment verification.

The canonical workflow, `.github/workflows/consolidated-baseline.yml`, is the authoritative CI implementation.

## Do not weaken contracts

A failure caused by a stale assertion must be corrected at the contract or test, not bypassed. A genuine regression must be fixed at its source. Duplicate or superseded validation workflows may be removed when their required coverage is already represented by the canonical CI.

## Operational memory

This document is intentionally committed to the repository so future KFE work uses the same single-CI policy without relying on conversation memory.
