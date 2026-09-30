# KFE 2.0 Engineering Operating Rules

## Purpose
These rules define the default execution behavior for Kanishka Fleet ERP (KFE) 2.0 engineering work. They are intended to prevent unnecessary pauses, fragmented implementation, and regression in execution behavior.

## 1. End-to-end execution
When the user has authorized a technical change, execute the complete engineering task end-to-end.

Do not stop for intermediate confirmation between normal implementation steps.

The default workflow is:

1. Inspect the current repository and relevant runtime state.
2. Identify the complete scope of the requested change.
3. Plan the implementation internally.
4. Make all related changes directly in the repository.
5. Run appropriate validation and tests.
6. Diagnose failures introduced by the work.
7. Fix those failures without requiring another confirmation.
8. Re-run validation until the task reaches its definition of done.
9. Commit/push when that is part of the authorized task.
10. Verify the resulting repository, CI, and deployment state when relevant.
11. Provide a concise final report.

## 2. No manual copy/paste burden
The user works from a mobile environment and should not be required to copy/paste implementation code into project files. Repository files should be created or updated directly through the available development tooling.

## 3. Batch related work
Treat a coherent request as one engineering task. Batch related file changes, validation, and repairs rather than performing one small change and asking whether to continue.

For a PWA-wide layout request, for example, inspect and update the complete affected UI system rather than changing one screen at a time and waiting for confirmation.

## 4. Definition of done
Changing code is not, by itself, completion.

A task is complete only after the relevant implementation has been validated. For UI/PWA work this normally includes, as applicable:

- global shell/layout consistency
- responsive/mobile behavior
- affected screens and modules
- preservation of existing functionality
- build success
- relevant UI/contract tests
- runtime/service-worker behavior where affected
- CI/deployment health where affected

If validation exposes a problem caused by the implementation, fixing it is part of the same task.

### Android overlay / APK work
For any change touching the Android overlay, Android bridge, ride lifecycle, fare/revenue, trip persistence, pending actions, notification actions, bubble/minimize behavior, foreground/background lifecycle, or APK workflow, the permanent release gate is **KFE_ANDROID_RELEASE_GATE.md**.

That file is mandatory reading before implementation and before declaring the work complete.

For Android overlay work, **green CI, successful compilation, or existence of an APK artifact is NOT sufficient**. The exact APK from the exact tested commit must pass the Golden Ride Gate, including real end-to-end overlay behavior, main-app/overlay parity, duplicate/replay protection, and bubble behavior.

If the device/emulator gate is unavailable, explicitly report **NOT DEVICE-VERIFIED**. Never represent static CI/build success as equivalent to device verification.

The APK delivered to the user must be the same APK that passed the applicable gate, identified by commit SHA, CI run, artifact, and APK SHA-256.

## 5. When to ask the user
Ask for clarification or confirmation only when one of these is true:

- authorization to make the change is genuinely unclear;
- a material product/business decision cannot reasonably be inferred from the established KFE specification;
- the requested action is materially destructive or irreversible and that scope has not been authorized.

Do not ask for confirmation merely because another implementation step remains.

## 6. Technical decisions belong to implementation
Once the objective and product intent are authorized, the engineering implementation details are owned by the engineering workflow. This includes selecting affected files, batching changes, choosing implementation order, running tests, diagnosing failures, and repairing implementation regressions.

## 7. Preserve frozen KFE rules
Technical changes must preserve established KFE 2.0 business/domain rules unless the user explicitly changes them.

In particular, do not silently alter:

- single-vehicle-first scope and extensible foundation;
- established module/domain boundaries;
- personal-use separation from business profitability calculations;
- fixed-expense lifecycle behavior;
- loan lifecycle, amortization, and prepayment rules;
- maintenance allocation/amortization rules;
- Work Session and Break handling;
- permanent exclusion of the Tax Reserve sub-account concept.

Future capabilities such as GPS, cloud sync, multi-vehicle fleet management, advanced analytics, ML, recommendations, and KFE Advisor remain future scope unless explicitly authorized.

## 8. CI and deployment
For CI/deployment work, inspect the current workflows and recent failures before modifying them. Prefer a clean, understandable primary path and preserve meaningful critical protections.

A skipped or failed workflow must be diagnosed from its actual trigger, job conditions, logs/status, and repository state rather than guessed from its appearance.

## 9. Avoid scope drift
Do not turn an authorized implementation task into an unrelated redesign. Preserve established architecture and business behavior unless the requested change requires otherwise.

## 10. Final report
After completing the task, report:

- what was changed;
- important files/components affected;
- validation performed and results;
- commit/deployment status when applicable;
- any remaining issue that could not reasonably be resolved within the authorized scope.

The user should not need to supervise the individual engineering steps.